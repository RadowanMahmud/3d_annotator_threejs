import { Component, ElementRef, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { GLTFLoader, PLYLoader } from 'three/examples/jsm/Addons.js';
import { CommonModule } from '@angular/common';
import { TrackballControls } from 'three/examples/jsm/Addons.js';

interface BoundingBoxData {
  obj_id: string;
  category_name: string;
  center_cam: number[];
  R_cam: number[][];
  dimensions: number[];
  bbox3D_cam: number[][];
}


@Component({
    selector: 'app-ply-viewer',
    imports: [CommonModule, FormsModule],
    standalone: true,
    templateUrl: './UploadPly.component.html',
    styleUrl: './UploadPly.component.css'
  })
export class PlyViewerComponent implements OnInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true }) 
  rendererContainer!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private trackballControls!: TrackballControls;
  
  private pointCloud: THREE.Points | null = null;
  private glbModel: THREE.Group | null = null;
  private boundingBoxMesh: THREE.LineSegments | null = null;
  private boundingBoxCorners: THREE.Mesh[] = [];

  private axesHelper!: THREE.AxesHelper;
  isEditMode = false;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  pointCloudStats: {
    points: number;
    boundingBox: {
      min: THREE.Vector3;
      max: THREE.Vector3;
    }
  } | null = null;

  pointSize: number = 0.05;

  private selectedCorner: THREE.Mesh | null = null;

    // New property for bounding box editing
    boundingBoxEditData: {
        centerX: number;
        centerY: number;
        centerZ: number;
        dimensionX: number;
        dimensionY: number;
        dimensionZ: number;
        rotationX: number;
        rotationY: number;
        rotationZ: number;
        originalVertices?: number[];
      } | null = null;

      ngOnInit() {
        console.log('Initializing scene');
        this.initScene();
        this.setupEventListeners();
        this.animate();
      }
    
      ngAfterViewInit() {
        console.log('After view init');
        // Ensure the container is ready
        setTimeout(() => {
          this.onWindowResize();
          this.renderer.render(this.scene, this.camera);
        }, 100);
      }
    
      private initScene() {
        // Scene setup (similar to previous implementation)
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);
    
        const container = this.rendererContainer.nativeElement;
    
        this.renderer = new THREE.WebGLRenderer({ 
          antialias: true,
          alpha: true 
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        this.renderer.setSize(
          container.clientWidth || window.innerWidth, 
          container.clientHeight || 500
        );
        
        container.innerHTML = '';
        container.appendChild(this.renderer.domElement);
    
        this.camera = new THREE.PerspectiveCamera(
          45, 
          (container.clientWidth || window.innerWidth) / (container.clientHeight || 500), 
          0.1, 
          1000
        );
    
        this.trackballControls = new TrackballControls(this.camera, this.renderer.domElement);
        
        this.trackballControls.rotateSpeed = 1.0;
        this.trackballControls.zoomSpeed = 1.2;
        this.trackballControls.panSpeed = 0.8;
    
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight1.position.set(1, 1, 1);
        this.scene.add(directionalLight1);
    
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight2.position.set(-1, -1, -1);
        this.scene.add(directionalLight2);
    
        this.axesHelper = new THREE.AxesHelper(10);
        this.scene.add(this.axesHelper);
    
        this.camera.position.z = 5;
      }
    
      private setupEventListeners() {
        window.addEventListener('resize', this.onWindowResize);
        window.addEventListener('keydown', this.onKeyDown);
        this.rendererContainer.nativeElement.addEventListener('dblclick', this.onDoubleClick);
        this.rendererContainer.nativeElement.addEventListener('mousedown', this.onMouseDown);
        this.rendererContainer.nativeElement.addEventListener('mousemove', this.onMouseMove);
        this.rendererContainer.nativeElement.addEventListener('mouseup', this.onMouseUp);
      }
    
      private onKeyDown = (event: KeyboardEvent) => {
        // Shift key to toggle edit mode
        if (event.shiftKey) {
          this.toggleEditMode();
        }
    
        // Space key to exit edit mode if in edit mode
        if (event.code === 'Space' && this.isEditMode) {
          this.toggleEditMode();
        }
      }
    
      private toggleEditMode() {
        this.isEditMode = !this.isEditMode;
    
        if (this.isEditMode) {
          // Disable trackball controls when in edit mode
          this.trackballControls.enabled = false;
          this.createBoundingBoxCorners();
        } else {
          // Re-enable trackball controls when exiting edit mode
          this.trackballControls.enabled = true;
          this.removeBoundingBoxCorners();
        }
      }

      private onMouseDown = (event: MouseEvent) => {
        if (!this.isEditMode) return;

        console.log("capturing the event")
    
        // Calculate mouse position in normalized device coordinates
        const container = this.rendererContainer.nativeElement;
        this.mouse.x = (event.clientX / container.clientWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / container.clientHeight) * 2 + 1;
    
        // Set up the raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);
    
        // Check for intersections with corner markers
        const intersects = this.raycaster.intersectObjects(this.boundingBoxCorners);

        console.log(intersects)
    
        if (intersects.length > 0) {
          this.selectedCorner = intersects[0].object as THREE.Mesh;
        }
      }
    
      private onMouseMove = (event: MouseEvent) => {
        if (!this.isEditMode || !this.selectedCorner || !this.boundingBoxMesh) return;

        console.log("Mouse is moving")
    
        // Calculate mouse position in normalized device coordinates
        const container = this.rendererContainer.nativeElement;
        this.mouse.x = (event.clientX / container.clientWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / container.clientHeight) * 2 + 1;
    
        // Raycast to find the new position on the current view plane
        const plane = new THREE.Plane(this.camera.getWorldDirection(new THREE.Vector3()));
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(this.mouse, this.camera);
    
        const intersectionPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectionPoint);
    
        // Update the selected corner's position
        this.selectedCorner.position.copy(intersectionPoint);
    
        // Recreate the bounding box mesh with updated corner positions
        this.updateBoundingBoxFromCorners();
      }
    
      private onMouseUp = () => {
        this.selectedCorner = null;
      }

      private updateBoundingBoxFromCorners() {
        if (!this.boundingBoxMesh || this.boundingBoxCorners.length === 0 || !this.boundingBoxEditData) return;
      
        // Extract corner positions
        const cornerPositions = this.boundingBoxCorners.map(corner => corner.position);
      
        // Compute new center
        const center = new THREE.Vector3();
        cornerPositions.forEach(pos => center.add(pos));
        center.divideScalar(cornerPositions.length);
      
        // Compute new dimensions
        const minX = Math.min(...cornerPositions.map(pos => pos.x));
        const maxX = Math.max(...cornerPositions.map(pos => pos.x));
        const minY = Math.min(...cornerPositions.map(pos => pos.y));
        const maxY = Math.max(...cornerPositions.map(pos => pos.y));
        const minZ = Math.min(...cornerPositions.map(pos => pos.z));
        const maxZ = Math.max(...cornerPositions.map(pos => pos.z));
      
        // Update boundingBoxEditData
        this.boundingBoxEditData = {
          ...this.boundingBoxEditData,
          centerX: center.x,
          centerY: center.y,
          centerZ: center.z,
          dimensionX: Math.abs(maxX - minX),
          dimensionY: Math.abs(maxY - minY),
          dimensionZ: Math.abs(maxZ - minZ)
        };
      
        // Recreate bounding box geometry
        const edgeIndices = [
          0, 1, 1, 2, 2, 3, 3, 0,  // First face
          4, 5, 5, 6, 6, 7, 7, 4,  // Second face
          0, 4, 1, 5, 2, 6, 3, 7   // Connecting lines
        ];
      
        const edgeVertices = edgeIndices.map(index => {
          const vertex = cornerPositions[index];
          return [vertex.x, vertex.y, vertex.z];
        }).flat();
      
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
      
        // Update bounding box mesh
        this.scene.remove(this.boundingBoxMesh);
        this.boundingBoxMesh = new THREE.LineSegments(
          geometry, 
          new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
        );
        this.scene.add(this.boundingBoxMesh);
      
        // Optional: Update corner positions to match the new geometry
        this.updateBoundingBoxCorners();
      }
      
      private updateBoundingBoxCorners() {
        if (!this.boundingBoxMesh || this.boundingBoxCorners.length === 0) return;
      
        // Get updated geometry positions
        const positions = this.boundingBoxMesh.geometry.getAttribute('position');
        
        // Update corner positions
        for (let i = 0; i < this.boundingBoxCorners.length; i++) {
          this.boundingBoxCorners[i].position.set(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
          );
        }
      }
      
    
      private removeBoundingBoxCorners() {
        this.boundingBoxCorners.forEach(corner => {
          this.scene.remove(corner);
        });
        this.boundingBoxCorners = [];
        this.selectedCorner = null;
      }
      private createBoundingBoxCorners() {
        // Clear any existing corners
        this.removeBoundingBoxCorners();
      
        // If no bounding box exists or no edit data, return
        if (!this.boundingBoxMesh || !this.boundingBoxEditData) return;
      
        // Get bounding box vertices
        const geometry = this.boundingBoxMesh.geometry;
        const positions = geometry.getAttribute('position');
        
        // Create corner markers
        const cornerGeometry = new THREE.SphereGeometry(0.1);
        const cornerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      
        // Create 8 corner markers
        for (let i = 0; i < positions.count; i++) {
          const vertex = new THREE.Vector3(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
          );
      
          const cornerMesh = new THREE.Mesh(cornerGeometry, cornerMaterial);
          cornerMesh.position.copy(vertex);
          this.scene.add(cornerMesh);
          this.boundingBoxCorners.push(cornerMesh);
        }
      }
      
      // Modify the existing method to prepare for corner editing
      private loadBoundingBoxFromJSON(jsonContent: string) {
        // Remove existing bounding box
        if (this.boundingBoxMesh) {
          this.scene.remove(this.boundingBoxMesh);
        }
      
        try {
          const data: BoundingBoxData[] = JSON.parse(jsonContent);
          
          if (data.length === 0) {
            console.warn('No bounding box data found in JSON');
            return;
          }
      
          // Use the first bounding box in the file
          const bboxData = data[0];
          
          // Extract vertices from bbox3D_cam
          const bbox3D = bboxData.bbox3D_cam;
          const flatVertices: number[] = [];
          bbox3D.forEach(vertex => {
            flatVertices.push(vertex[0], vertex[1], vertex[2]);
          });
      
          // Compute center
          const centerX = bbox3D.reduce((sum, vertex) => sum + vertex[0], 0) / bbox3D.length;
          const centerY = bbox3D.reduce((sum, vertex) => sum + vertex[1], 0) / bbox3D.length;
          const centerZ = bbox3D.reduce((sum, vertex) => sum + vertex[2], 0) / bbox3D.length;
      
          // Compute dimensions by finding min and max
          const minX = Math.min(...bbox3D.map(v => v[0]));
          const maxX = Math.max(...bbox3D.map(v => v[0]));
          const minY = Math.min(...bbox3D.map(v => v[1]));
          const maxY = Math.max(...bbox3D.map(v => v[1]));
          const minZ = Math.min(...bbox3D.map(v => v[2]));
          const maxZ = Math.max(...bbox3D.map(v => v[2]));
      
          // Store bounding box edit data
          this.boundingBoxEditData = {
            centerX,
            centerY,
            centerZ,
            dimensionX: Math.abs(maxX - minX),
            dimensionY: Math.abs(maxY - minY),
            dimensionZ: Math.abs(maxZ - minZ),
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            originalVertices: flatVertices
          };
      
          // Create initial bounding box mesh using flat vertices
          this.createBoundingBoxMesh(flatVertices);
        } catch (error) {
          console.error('Error parsing JSON:', error);
        }
      }
      
      // Existing method to create bounding box mesh
      private createBoundingBoxMesh(vertices: number[]) {
        const geometry = new THREE.BufferGeometry();
      
        // Define edges of the bounding box using the flattened vertices
        const edgeIndices = [
          0, 1, 1, 2, 2, 3, 3, 0,  // First face
          4, 5, 5, 6, 6, 7, 7, 4,  // Second face
          0, 4,  // Connecting lines between faces
          1, 5, 
          2, 6, 
          3, 7
        ];
      
        const edgeVertices = edgeIndices.map(index => vertices.slice(index * 3, index * 3 + 3)).flat();
      
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
      
        // Create bounding box mesh with edges
        const material = new THREE.LineBasicMaterial({ 
          color: 0xff0000,  // Red color for bounding box
          linewidth: 2
        });
      
        this.boundingBoxMesh = new THREE.LineSegments(geometry, material);
      
        // Add to scene
        this.scene.add(this.boundingBoxMesh);
      }
    

  ngOnDestroy() {
    // Cleanup
    this.trackballControls.dispose();
    this.renderer.dispose();
    
    // Remove existing objects
    this.clearScene();

    // Remove event listeners
    window.removeEventListener('resize', this.onWindowResize);
    this.rendererContainer.nativeElement.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
    this.rendererContainer.nativeElement.removeEventListener('mousedown', this.onMouseDown);
    this.rendererContainer.nativeElement.removeEventListener('mousemove', this.onMouseMove);
    this.rendererContainer.nativeElement.removeEventListener('mouseup', this.onMouseUp);
  }

  private clearScene() {
    // Remove point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud = null;
    }

    // Remove GLB model
    if (this.glbModel) {
      this.scene.remove(this.glbModel);
      this.glbModel = null;
    }

    // Remove bounding box
    if (this.boundingBoxMesh) {
      this.scene.remove(this.boundingBoxMesh);
      this.boundingBoxMesh = null;
    }

    // Remove axes helper
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper);
    }
  }


//   private setupEventListeners() {
//     window.addEventListener('resize', this.onWindowResize);
//     this.rendererContainer.nativeElement.addEventListener('dblclick', this.onDoubleClick);
//   }

  private onWindowResize = () => {
    const container = this.rendererContainer.nativeElement;
    
    // Update camera aspect ratio
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();

    // Update renderer size
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  private onDoubleClick = (event: MouseEvent) => {
    // Calculate mouse position in normalized device coordinates
    const container = this.rendererContainer.nativeElement;
    this.mouse.x = (event.clientX / container.clientWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / container.clientHeight) * 2 + 1;

    // Set up the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for intersections with the point cloud or GLB model
    const intersectObjects: THREE.Object3D[] = [];
    if (this.pointCloud) intersectObjects.push(this.pointCloud);
    if (this.glbModel) intersectObjects.push(this.glbModel);

    const intersects = this.raycaster.intersectObjects(intersectObjects);

    if (intersects.length > 0) {
      // Get the first intersected point
      const intersectionPoint = intersects[0].point;

      // Adjust camera to focus on this point
      this.focusOnPoint(intersectionPoint);
    }
  }

  private focusOnPoint(point: THREE.Vector3) {
    // Smoothly move the camera target to the selected point
    this.trackballControls.target.copy(point);
    
    // Adjust camera distance
    const distanceToPoint = this.camera.position.distanceTo(point);
    const newCameraPosition = point.clone().sub(
      this.camera.position.clone()
        .sub(point)
        .normalize()
        .multiplyScalar(distanceToPoint)
    );

    // Animate camera movement
    this.animateCameraToPosition(newCameraPosition, point);
  }

  private animateCameraToPosition(newPosition: THREE.Vector3, target: THREE.Vector3) {
    const duration = 500; // Animation duration in milliseconds
    const startPosition = this.camera.position.clone();
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Interpolate camera position
      this.camera.position.lerpVectors(startPosition, newPosition, progress);
      
      // Update trackball controls target
      this.trackballControls.target.copy(target);
      this.trackballControls.update();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    
    // Update controls
    this.trackballControls.update();
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  onPLYFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      this.loadPLYFile(arrayBuffer);
    };

    reader.readAsArrayBuffer(file);
  }

  onGLBFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      this.loadGLBFile(arrayBuffer);
    };

    reader.readAsArrayBuffer(file);
  }

  private loadPLYFile(arrayBuffer: ArrayBuffer) {
    // Remove existing point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
    }
  
    // Create PLY loader
    const loader = new PLYLoader();
    const geometry = loader.parse(arrayBuffer);
  
    // Coordinate transformation matrix
    const transformMatrix = new THREE.Matrix4().set(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
  
    // Apply coordinate transformation to geometry
    const positions = geometry.getAttribute('position');
    const transformedPositions = new Float32Array(positions.count * 3);
  
    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );
  
      // Transform the vertex
      vertex.applyMatrix4(transformMatrix);
  
      transformedPositions[i * 3] = vertex.x;
      transformedPositions[i * 3 + 1] = vertex.y;
      transformedPositions[i * 3 + 2] = vertex.z;
    }
  
    // Replace original positions with transformed positions
    geometry.setAttribute('position', new THREE.BufferAttribute(transformedPositions, 3));
  
    // Prepare color material
    let material: THREE.PointsMaterial;
    
    // Check if geometry has color attribute
    if (geometry.hasAttribute('color')) {
      // Use vertex colors if available
      material = new THREE.PointsMaterial({ 
        size: this.pointSize,
        vertexColors: true
      });
    } else {
      // Fallback to default green color
      material = new THREE.PointsMaterial({ 
        color: 0x00ff00,
        size: this.pointSize
      });
    }
  
    // Create point cloud without centering
    this.pointCloud = new THREE.Points(geometry, material);
  
    // Update point cloud stats
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    if (boundingBox) {
      this.pointCloudStats = {
        points: geometry.attributes['position'].count,
        boundingBox: {
          min: boundingBox.min,
          max: boundingBox.max
        }
      };
    }
  
    // Add to scene at original position
    this.scene.add(this.pointCloud);
  
    // Adjust camera to view the entire point cloud
    this.fitCameraToObject(this.pointCloud);
  }
  
  private loadGLBFile(arrayBuffer: ArrayBuffer) {
    // Remove existing GLB model
    if (this.glbModel) {
      this.scene.remove(this.glbModel);
    }
  
    // Create GLTF loader
    const loader = new GLTFLoader();
  
    // Parse the ArrayBuffer
    loader.parse(arrayBuffer, '', (gltf) => {
      // Store the model without any positioning modifications
      this.glbModel = gltf.scene;
  
      // Traverse meshes to preserve original materials
      this.glbModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Handle potential array of materials or single material
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          
          child.material = materials.map(material => {
            // Check if it's a standard material that supports color and other properties
            if (material instanceof THREE.MeshStandardMaterial) {
              const stdMaterial = material as THREE.MeshStandardMaterial;
              return stdMaterial.clone();
            }
            return material;
          });
  
          // If it was a single material, unwrap from array
          if (materials.length === 1) {
            child.material = child.material[0];
          }
        }
      });
  
      // Add to scene without any positioning modifications
      this.scene.add(this.glbModel);
  
      // Adjust camera to view the entire model
      this.fitCameraToObject(this.glbModel);
  
      // Logging for debugging
      console.log('Loaded GLB Model Details:', {
        name: this.glbModel.name,
        childCount: this.glbModel.children.length,
        meshes: this.glbModel.children
          .filter(child => child instanceof THREE.Mesh)
          .map(mesh => {
            const materialInfo: any = {};
            
            if (mesh instanceof THREE.Mesh) {
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              
              materialInfo.materialCount = materials.length;
              materialInfo.materialTypes = materials.map(m => m.constructor.name);
              
              materialInfo.colors = materials
                .filter(m => m instanceof THREE.MeshStandardMaterial)
                .map(m => (m as THREE.MeshStandardMaterial).color.getHexString());
            }
            
            return {
              name: mesh.name,
              ...materialInfo
            };
          })
      });
    }, 
    // Error handling
    (error) => {
      console.error('Error loading GLB file:', error);
    });
  }

  private fitCameraToObject(object: THREE.Points | THREE.Group) {
    const boundingBox = new THREE.Box3().setFromObject(object);
    const size = boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Compute the distance to fit the object
    const fitHeightDistance = maxDim / (2 * Math.atan(Math.PI / 4));
    const fitWidthDistance = fitHeightDistance / this.camera.aspect;
    const distance = 1.5 * Math.max(fitHeightDistance, fitWidthDistance);

    const center = boundingBox.getCenter(new THREE.Vector3());
    
    // Position camera
    this.camera.position.copy(center);
    this.camera.position.z += distance;
    this.camera.lookAt(center);

    // Update trackball controls
    this.trackballControls.target.copy(center);
    this.trackballControls.update();

    // Reposition axes helper to object center
    this.axesHelper.position.copy(center);
  }

  onJSONFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const jsonContent = e.target?.result as string;
      this.loadBoundingBoxFromJSON(jsonContent);
    };

    reader.readAsText(file);
  }

//   // New method to create bounding box mesh
//   private createBoundingBoxMesh(vertices: number[]) {
//     const geometry = new THREE.BufferGeometry();

//     // Define edges of the bounding box using the flattened vertices
//     const edgeIndices = [
//       0, 1, 1, 2, 2, 3, 3, 0,  // First face
//       4, 5, 5, 6, 6, 7, 7, 4,  // Second face
//       0, 4,  // Connecting lines between faces
//       1, 5, 
//       2, 6, 
//       3, 7
//     ];

//     const edgeVertices = edgeIndices.map(index => vertices.slice(index * 3, index * 3 + 3)).flat();

//     geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));

//     // Create bounding box mesh with edges
//     const material = new THREE.LineBasicMaterial({ 
//       color: 0xff0000,  // Red color for bounding box
//       linewidth: 2
//     });

//     this.boundingBoxMesh = new THREE.LineSegments(geometry, material);

//     // Add to scene
//     this.scene.add(this.boundingBoxMesh);
//   }

//   private loadBoundingBoxFromJSON(jsonContent: string) {
//     // Remove existing bounding box
//     if (this.boundingBoxMesh) {
//       this.scene.remove(this.boundingBoxMesh);
//     }
  
//     try {
//       const data: BoundingBoxData[] = JSON.parse(jsonContent);
      
//       if (data.length === 0) {
//         console.warn('No bounding box data found in JSON');
//         return;
//       }
  
//       // Use the first bounding box in the file
//       const bboxData = data[0];
      
//       // Extract vertices from bbox3D_cam
//       const bbox3D = bboxData.bbox3D_cam;
//       const flatVertices: number[] = [];
//       bbox3D.forEach(vertex => {
//         flatVertices.push(vertex[0], vertex[1], vertex[2]);
//       });

//       // Compute center
//       const centerX = bbox3D.reduce((sum, vertex) => sum + vertex[0], 0) / bbox3D.length;
//       const centerY = bbox3D.reduce((sum, vertex) => sum + vertex[1], 0) / bbox3D.length;
//       const centerZ = bbox3D.reduce((sum, vertex) => sum + vertex[2], 0) / bbox3D.length;

//       // Compute dimensions by finding min and max
//       const minX = Math.min(...bbox3D.map(v => v[0]));
//       const maxX = Math.max(...bbox3D.map(v => v[0]));
//       const minY = Math.min(...bbox3D.map(v => v[1]));
//       const maxY = Math.max(...bbox3D.map(v => v[1]));
//       const minZ = Math.min(...bbox3D.map(v => v[2]));
//       const maxZ = Math.max(...bbox3D.map(v => v[2]));

//       // Store bounding box edit data
//       this.boundingBoxEditData = {
//         centerX,
//         centerY,
//         centerZ,
//         dimensionX: Math.abs(maxX - minX),
//         dimensionY: Math.abs(maxY - minY),
//         dimensionZ: Math.abs(maxZ - minZ),
//         rotationX: 0,
//         rotationY: 0,
//         rotationZ: 0,
//         originalVertices: flatVertices
//       };

//       // Create initial bounding box mesh
//       this.createBoundingBoxMesh(flatVertices);
//     } catch (error) {
//       console.error('Error parsing JSON:', error);
//     }
//   }

  // Update method to use new property names
  updateBoundingBox() {
    if (!this.boundingBoxMesh || !this.boundingBoxEditData || !this.boundingBoxEditData.originalVertices) {
      return;
    }

    // Remove existing bounding box
    this.scene.remove(this.boundingBoxMesh);

    // Create rotation matrix
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(this.boundingBoxEditData.rotationX),
        THREE.MathUtils.degToRad(this.boundingBoxEditData.rotationY),
        THREE.MathUtils.degToRad(this.boundingBoxEditData.rotationZ),
        'XYZ'
      )
    );

    // Scale matrix
    const scaleMatrix = new THREE.Matrix4().makeScale(
      this.boundingBoxEditData.dimensionX / this.computeCurrentWidth(),
      this.boundingBoxEditData.dimensionY / this.computeCurrentHeight(),
      this.boundingBoxEditData.dimensionZ / this.computeCurrentDepth()
    );

    // Combine transformations
    const transformMatrix = new THREE.Matrix4()
      .multiply(rotationMatrix)
      .multiply(scaleMatrix);

    // Transform vertices
    const transformedVertices: number[] = [];
    const originalVertices = this.boundingBoxEditData.originalVertices;

    for (let i = 0; i < originalVertices.length; i += 3) {
      const vertex = new THREE.Vector3(
        originalVertices[i] - this.boundingBoxEditData.centerX, 
        originalVertices[i + 1] - this.boundingBoxEditData.centerY, 
        originalVertices[i + 2] - this.boundingBoxEditData.centerZ
      );

      // Apply transformation
      vertex.applyMatrix4(transformMatrix);

      // Translate back and add new center
      transformedVertices.push(
        vertex.x + this.boundingBoxEditData.centerX,
        vertex.y + this.boundingBoxEditData.centerY,
        vertex.z + this.boundingBoxEditData.centerZ
      );
    }

    // Recreate bounding box mesh with transformed vertices
    this.createBoundingBoxMesh(transformedVertices);
  }

  // Helper methods to compute current dimensions remain the same
  private computeCurrentWidth(): number {
    if (!this.boundingBoxEditData || !this.boundingBoxEditData.originalVertices) return 1;
    const vertices = this.boundingBoxEditData.originalVertices;
    const xs = [vertices[0], vertices[3], vertices[6], vertices[9]];
    return Math.abs(Math.max(...xs) - Math.min(...xs));
  }

  private computeCurrentHeight(): number {
    if (!this.boundingBoxEditData || !this.boundingBoxEditData.originalVertices) return 1;
    const vertices = this.boundingBoxEditData.originalVertices;
    const ys = [vertices[1], vertices[4], vertices[7], vertices[10]];
    return Math.abs(Math.max(...ys) - Math.min(...ys));
  }

  private computeCurrentDepth(): number {
    if (!this.boundingBoxEditData || !this.boundingBoxEditData.originalVertices) return 1;
    const vertices = this.boundingBoxEditData.originalVertices;
    const zs = [vertices[2], vertices[5], vertices[8], vertices[11]];
    return Math.abs(Math.max(...zs) - Math.min(...zs));
  }

  updatePointSize(event: Event) {
    this.pointSize = parseFloat((event.target as HTMLInputElement).value);
    
    if (this.pointCloud) {
      const pointMaterial = this.pointCloud.material as THREE.PointsMaterial;
      pointMaterial.size = this.pointSize;
      
      // Force material update
      pointMaterial.needsUpdate = true;
    }
  }
}