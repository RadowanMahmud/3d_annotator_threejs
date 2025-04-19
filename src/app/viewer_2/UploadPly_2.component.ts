import { Component, ElementRef, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { GLTFLoader, PLYLoader } from 'three/examples/jsm/Addons.js';
import { CommonModule } from '@angular/common';
import { TrackballControls } from 'three/examples/jsm/Addons.js';
import { ImageViewerComponent } from "../imge_viewer/image_viewer.component";
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface BoundingBoxData {
  obj_id: string;
  category_name: string;
  center_cam: number[];
  R_cam: number[][];
  dimensions: number[];
  bbox3D_cam: number[][];
  euler_angles_xyz: number[]
}

interface BoundingBoxEditData {
  obj_id: string;
  category_name: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  dimensionX: number;
  dimensionY: number;
  dimensionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}

@Component({
    selector: 'app-ply-two-viewer',
    imports: [CommonModule, FormsModule, ImageViewerComponent],
    standalone: true,
    templateUrl: './UploadPly_2.component.html',
    styleUrl: './UploadPly_2.component.css'
  })
export class PlyViewer2Component implements OnInit, OnDestroy {
  @ViewChild('rendererContainer', { static: true }) 
  rendererContainer!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private trackballControls!: TrackballControls;
  
  private pointCloud: THREE.Points | null = null;
  private boundingBoxMesh: THREE.Group | THREE.LineSegments | null = null;

  private axesHelper!: THREE.AxesHelper;
  isEditMode = false;
  selectedBoundingBoxIndex : number = 0;

  boundingJsonBoxData: BoundingBoxData[] = [];

  keyState: any;

  constructor(
    private route: ActivatedRoute, 
    private http: HttpClient
  ) {}

  pointCloudStats: {
    points: number;
    boundingBox: {
      min: THREE.Vector3;
      max: THREE.Vector3;
    }
  } | null = null;

  pointSize: number = 0.05;

  initialRotation: any;
  rotationCenter: THREE.Vector3 = new THREE.Vector3();
  lastDragPosition: any;
  startDragAngle: any;
  // New property for bounding box editing
  boundingBoxEditData: BoundingBoxEditData[] = [];
  basePath: any;
  decoded_path: any;


  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const encodedPath = params.get('path');
      this.basePath = encodedPath ? decodeURIComponent(encodedPath) : '';
      this.loadDataFromPath(this.basePath);
    });
    this.initScene();
    this.animate();
    this.setupEventListeners();
  }
  handleSelectKeyDown(event: KeyboardEvent) {
    if (['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      // Handle the arrow key press as needed
    }
  }
  loadDataFromPath(path: string) {
    try {
      // Decode the path if it was URL-encoded
      const decodedPath = decodeURIComponent(path);
      this.decoded_path = decodedPath
      
      fetch(`${decodedPath}/depth_scene.ply`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
          }
          return response.arrayBuffer(); // Get as arrayBuffer instead of json
        })
        .then(arrayBuffer => {
          this.loadPLYFile(arrayBuffer); // Pass to your PLY loader function
        })
        .catch(error => {
          console.error('Error loading or parsing the file:', error);
        });
      // Use fetch API to load the file from the path
      fetch(`${decodedPath}/3dbbox.json`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(jsonData => {
          this.loadBoundingBoxFromJSON(JSON.stringify(jsonData));
        })
        .catch(error => {
          console.error('Error loading or parsing the file:', error);
        });

    } catch (error) {
      console.error('Error accessing file:', error);
    }
  }
  ngAfterViewInit() {
    console.log('After view init');
    // Ensure the container is ready
    setTimeout(() => {
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

  private animate = () => {
    requestAnimationFrame(this.animate);
    
    // Update trackball controls when not in edit mode
    if (!this.isEditMode) {
      this.trackballControls.update();
    }
    
    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  private setupEventListeners() {
    // Store key states
    this.keyState = {
      KeyR: false,
      KeyC: false,
      KeyD: false,
      KeyX: false,
      KeyY: false,
      KeyZ: false,
      ArrowRight: false,
      ArrowLeft: false
    };
  
    type ModeName = 'R' | 'C' | 'D';
    type AxisName = 'X' | 'Y' | 'Z';
    type DirectionName = 'Right' | 'Left';
    
    // Define actions based on key combinations with proper typing
    const keyActions: Record<ModeName, Record<AxisName, Record<DirectionName, (idx: number) => void>>> = {
      // Rotations (R + axis + direction)
      R: {
        X: {
          Right: (idx) => { this.boundingBoxEditData[idx].rotationX += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].rotationX -= 0.01; }
        },
        Y: {
          Right: (idx) => { this.boundingBoxEditData[idx].rotationY += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].rotationY -= 0.01; }
        },
        Z: {
          Right: (idx) => { this.boundingBoxEditData[idx].rotationZ += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].rotationZ -= 0.01; }
        }
      },
      // Positions/Centers (C + axis + direction)
      C: {
        X: {
          Right: (idx) => { this.boundingBoxEditData[idx].centerX += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].centerX -= 0.01; }
        },
        Y: {
          Right: (idx) => { this.boundingBoxEditData[idx].centerY += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].centerY -= 0.01; }
        },
        Z: {
          Right: (idx) => { this.boundingBoxEditData[idx].centerZ += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].centerZ -= 0.01; }
        }
      },
      // Dimensions (D + axis + direction)
      D: {
        X: {
          Right: (idx) => { this.boundingBoxEditData[idx].dimensionX += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].dimensionX -= 0.01; }
        },
        Y: {
          Right: (idx) => { this.boundingBoxEditData[idx].dimensionY += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].dimensionY -= 0.01; }
        },
        Z: {
          Right: (idx) => { this.boundingBoxEditData[idx].dimensionZ += 0.01; },
          Left: (idx) => { this.boundingBoxEditData[idx].dimensionZ -= 0.01; }
        }
      }
    };
  
    // Map keyboard codes to action keys with explicit typing
    const modeMap: Record<string, ModeName | undefined> = {
      KeyR: 'R',
      KeyC: 'C',
      KeyD: 'D'
    };
    
    const axisMap: Record<string, AxisName | undefined> = {
      KeyX: 'X',
      KeyY: 'Y',
      KeyZ: 'Z'
    };
    
    const directionMap: Record<string, DirectionName | undefined> = {
      ArrowRight: 'Right',
      ArrowLeft: 'Left'
    };
  
    // Handle key down events
    window.addEventListener('keydown', (event) => {
      // Update key state
      if (this.keyState.hasOwnProperty(event.code)) {
        this.keyState[event.code] = true;
      }

      // Process all key combinations in a type-safe way
      for (const [modeCode, modeKey] of Object.entries(modeMap)) {
        if (!this.keyState[modeCode] || !modeKey) continue;
        
        for (const [axisCode, axisKey] of Object.entries(axisMap)) {
          if (!this.keyState[axisCode] || !axisKey) continue;
          
          for (const [dirCode, dirKey] of Object.entries(directionMap)) {
            if (!this.keyState[dirCode] || !dirKey) continue;
            
            // Apply the action
            keyActions[modeKey][axisKey][dirKey](this.selectedBoundingBoxIndex);
          }
        }
      }
      
      this.updateBoundingBox();
    });
  
    // Handle key up events to reset key states
    window.addEventListener('keyup', (event) => {
      if (this.keyState.hasOwnProperty(event.code)) {
        this.keyState[event.code] = false;
      }
    });
  }

  // Method for disposing elements
  ngOnDestroy() {
  }

  // TODO: Color not updating after select
  onBoundingBoxSelect() {
    if (!this.boundingBoxMesh || !(this.boundingBoxMesh instanceof THREE.Group)) {
      return;
    }
    console.log(this.selectedBoundingBoxIndex)
    
    // Update the visibility and appearance of the bounding boxes
    const boxGroup = this.boundingBoxMesh as THREE.Group;
    
    // Go through each child (each bounding box)
    for (let i = 0; i < boxGroup.children.length; i++) {
      const boxMesh = boxGroup.children[i] as THREE.LineSegments;
      const material = boxMesh.material as THREE.LineBasicMaterial;
      
      if (i === this.selectedBoundingBoxIndex) {
        // Highlight the selected box
        material.color.set(0xffff00); // Yellow
        material.linewidth = 2;
      } else {
        // Make other boxes red
        material.color.set(0xff0000); // Red
        material.linewidth = 1;
      }
    }
    
    // Force material update
    setTimeout(() => {
      this.renderer.render(this.scene, this.camera);
    }, 10);
    
    console.log(`Selected bounding box: ${this.boundingBoxEditData[this.selectedBoundingBoxIndex].obj_id} - ${this.boundingBoxEditData[this.selectedBoundingBoxIndex].category_name}`);
  }

  updateBoundingBox() {
    if (!this.boundingBoxMesh || this.boundingBoxEditData.length === 0) {
      return;
    }
    
    // Get the selected bounding box data
    const boxData = this.boundingBoxEditData[this.selectedBoundingBoxIndex];
    
    const vertices = this.createBoxVerticesFromParams(boxData);
    
    // Update the geometry of the selected bounding box
    if (this.boundingBoxMesh instanceof THREE.Group) {
      // Get the selected box mesh
      const boxMesh = this.boundingBoxMesh.children[this.selectedBoundingBoxIndex] as THREE.LineSegments;
      
      // Update geometry positions
      const positions = boxMesh.geometry.attributes['position'] as THREE.BufferAttribute;
      
      // Define edges of the bounding box
      const edgeIndices = [
        0, 1, 1, 2, 2, 3, 3, 0,  // First face
        4, 5, 5, 6, 6, 7, 7, 4,  // Second face
        0, 4, 1, 5, 2, 6, 3, 7   // Connecting lines between faces
      ];
      
      // Update vertex positions
      for (let i = 0; i < edgeIndices.length; i++) {
        const vertexIndex = edgeIndices[i];
        const vertex = vertices[vertexIndex];
        positions.setXYZ(i, vertex[0], vertex[1], vertex[2]);
      }
      
      positions.needsUpdate = true;
      boxMesh.geometry.computeBoundingSphere();
    }
    
    // Render the updated scene
    this.renderer.render(this.scene, this.camera);

    this.boundingJsonBoxData[this.selectedBoundingBoxIndex].bbox3D_cam = vertices

    this.boundingJsonBoxData = [...this.boundingJsonBoxData]
  }
  

  private calculateBoundingBoxVertices(
    centerX: number, centerY: number, centerZ: number,
    height: number, width: number, length: number,  // Matches Python: [h, w, l]
    rotX: number, rotY: number, rotZ: number
  ): number[][] {
    // Match Python axis mapping: X=l, Y=h, Z=w
    const center = new THREE.Vector3(centerX, centerY, centerZ);
    const halfL = length / 2;  // X
    const halfH = height / 2;  // Y
    const halfW = width / 2;   // Z
  
    const rotation = new THREE.Euler(rotX, rotY, rotZ, 'ZYX');
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
  
    // Match Python vertex layout exactly
    const vertices = [
      new THREE.Vector3(-halfL, -halfH, -halfW), // v0
      new THREE.Vector3( halfL, -halfH, -halfW), // v1
      new THREE.Vector3( halfL,  halfH, -halfW), // v2
      new THREE.Vector3(-halfL,  halfH, -halfW), // v3
      new THREE.Vector3(-halfL, -halfH,  halfW), // v4
      new THREE.Vector3( halfL, -halfH,  halfW), // v5
      new THREE.Vector3( halfL,  halfH,  halfW), // v6
      new THREE.Vector3(-halfL,  halfH,  halfW)  // v7
    ];
  
    return vertices.map(v => v.clone().applyMatrix4(rotationMatrix).add(center))
                   .map(v => [v.x, v.y, v.z]);
  }
  

  exportBoundingBoxesToJSON() {
    for (let i = 0; i < this.boundingJsonBoxData.length; i++) {
      const bboxData = this.boundingJsonBoxData[i];
      
      // Extract vertices from bbox3D_cam
      const bbox3D = bboxData.bbox3D_cam;
      
      // Store bounding box edit data
      const v0 = new THREE.Vector3(...bbox3D[0]);
      const v1 = new THREE.Vector3(...bbox3D[1]);
      const v3 = new THREE.Vector3(...bbox3D[3]);
      const v4 = new THREE.Vector3(...bbox3D[4]);
    
      // Axes from v0
      const xAxis = new THREE.Vector3().subVectors(v1, v0).normalize(); // length
      const yAxis = new THREE.Vector3().subVectors(v3, v0).normalize(); // height
      const zAxis = new THREE.Vector3().subVectors(v4, v0).normalize(); // width
    
      // Reconstruct rotation matrix (3x3)
      const rotationMatrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    
      // Compute center as average of all vertices
      const center = bbox3D.reduce((acc, v) => {
        acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2];
        return acc;
      }, [0, 0, 0]).map(c => c / 8);
    
      // Compute dimensions from distances
      const width = v1.distanceTo(v0);  // X
      const length = v3.distanceTo(v0);  // Y
      const height  = v4.distanceTo(v0);  // Z

      const obj_id =  bboxData.obj_id;
      const category_name = bboxData.category_name;

      this.boundingJsonBoxData[i].center_cam = center
      this.boundingJsonBoxData[i].dimensions = [length, width, height]
      this.boundingJsonBoxData[i].R_cam = [
        [rotationMatrix.elements[0], rotationMatrix.elements[4], rotationMatrix.elements[8]],
        [rotationMatrix.elements[1], rotationMatrix.elements[5], rotationMatrix.elements[9]],
        [rotationMatrix.elements[2], rotationMatrix.elements[6], rotationMatrix.elements[10]]
      ];
    }
    const jsonContent = JSON.stringify(this.boundingJsonBoxData, null, 2);
  
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const id = this.decoded_path.split('/')[this.decoded_path.split('/').length - 1]
    link.download = id + '_3dbox_refined.json';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // code to handle file uploads
  onFileUpload(event: Event, type: string){
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    if (type === 'ply') {
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        this.loadPLYFile(arrayBuffer);
      };
    }  
    reader.readAsArrayBuffer(file);
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
  private loadPLYFile(arrayBuffer: ArrayBuffer) {
    // Remove existing point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
    }
  
    // Create PLY loader
    const loader = new PLYLoader();
    const geometry = loader.parse(arrayBuffer);
  
    // Apply coordinate transformation to geometry
    const positions = geometry.getAttribute('position');
    const transformedPositions = new Float32Array(positions.count * 3);
  
    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );
  
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
  private loadBoundingBoxFromJSON(jsonContent: string) {
    // Remove existing bounding box
    if (this.boundingBoxMesh) {
      this.scene.remove(this.boundingBoxMesh);
      this.boundingBoxMesh = null;
    }
    
    // Clear existing bounding box data
    this.boundingBoxEditData = [];
  
    try {
      const data: BoundingBoxData[] = JSON.parse(jsonContent);
      this.boundingJsonBoxData = data;
      if (data.length === 0) {
        console.warn('No bounding box data found in JSON');
        return;
      }
  
      // Create a group to hold all bounding boxes
      const boxGroup = new THREE.Group();
      
      // Process all bounding boxes in the file
      for (let i = 0; i < data.length; i++) {
        const bboxData = data[i];
        
        // Extract vertices from bbox3D_cam
        const bbox3D = bboxData.bbox3D_cam;
        
        // Store bounding box edit data
        const v0 = new THREE.Vector3(...bbox3D[0]);
        const v1 = new THREE.Vector3(...bbox3D[1]);
        const v3 = new THREE.Vector3(...bbox3D[3]);
        const v4 = new THREE.Vector3(...bbox3D[4]);
      
        // Axes from v0
        const xAxis = new THREE.Vector3().subVectors(v1, v0).normalize(); // length
        const yAxis = new THREE.Vector3().subVectors(v3, v0).normalize(); // height
        const zAxis = new THREE.Vector3().subVectors(v4, v0).normalize(); // width
      
        // Reconstruct rotation matrix (3x3)
        const rotationMatrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        const euler = new THREE.Euler().setFromRotationMatrix(rotationMatrix, 'ZYX');
      
        // Compute center as average of all vertices
        const center = bbox3D.reduce((acc, v) => {
          acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2];
          return acc;
        }, [0, 0, 0]).map(c => c / 8);
      
        // Compute dimensions from distances
        const width = v1.distanceTo(v0);  // X
        const length = v3.distanceTo(v0);  // Y
        const height  = v4.distanceTo(v0);  // Z

        const obj_id =  bboxData.obj_id;
        const category_name = bboxData.category_name;
      
        // Push reconstructed data
        this.boundingBoxEditData.push({
          obj_id,
          category_name,
          centerX: center[0],
          centerY: center[1],
          centerZ: center[2],
          dimensionX: length,
          dimensionY: height,
          dimensionZ: width,
          rotationX: euler.x,
          rotationY: euler.y,
          rotationZ: euler.z
        });
        
        // Create and add individual bounding box
        // const vertices = this.createBoxVerticesFromParams(this.boundingBoxEditData[i]);
        // const boxMesh = this.createIndividualBoundingBoxMesh(vertices, i === 0);
        const boxMesh = this.createIndividualBoundingBoxMesh(bbox3D, i === 0);
        boxGroup.add(boxMesh);
      }
      
      // Add the group to the scene
      this.boundingBoxMesh = boxGroup;
      this.scene.add(this.boundingBoxMesh);
      
      // Set the first box as selected by default
      if (this.boundingBoxEditData.length > 0) {
        this.selectedBoundingBoxIndex = 0;
        this.onBoundingBoxSelect();
      }
      
    } catch (error) {
      console.error('Error parsing JSON:', error);
    }
  }
  
  private createIndividualBoundingBoxMesh(vertices: number[][], isSelected: boolean = false): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
  
    // Define edges of the bounding box
    const edgeIndices = [
      0, 1, 1, 2, 2, 3, 3, 0,  // First face
      4, 5, 5, 6, 6, 7, 7, 4,  // Second face
      0, 4, 1, 5, 2, 6, 3, 7   // Connecting lines between faces
    ];
    
    // Create flattened array of vertices for the edges
    const positions: number[] = [];
    
    for (let i = 0; i < edgeIndices.length; i++) {
      const vertexIndex = edgeIndices[i];
      const vertex = vertices[vertexIndex];
      positions.push(vertex[0], vertex[1], vertex[2]);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    // Create material with color based on selection state
    const material = new THREE.LineBasicMaterial({
      color: isSelected ? 0xffff00 : 0xff0000, // Yellow if selected, red otherwise
      linewidth: isSelected ? 2 : 1 // Thicker line if selected
    });
    
    return new THREE.LineSegments(geometry, material);
  }

  createBoxVerticesFromParams(boxData: BoundingBoxEditData): number[][] {
    return this.calculateBoundingBoxVertices(
      boxData.centerX, boxData.centerY, boxData.centerZ,
      boxData.dimensionX, boxData.dimensionY, boxData.dimensionZ,
      boxData.rotationX, boxData.rotationY, boxData.rotationZ
    );
  }
}