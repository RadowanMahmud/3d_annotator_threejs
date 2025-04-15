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
    imports: [CommonModule, FormsModule],
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

  keyState: any;


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

  ngOnInit() {
    this.initScene();
    this.animate();
    this.setupEventListeners();
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
      ArrowUp: false,
      ArrowDown: false
    };
  
    type ModeName = 'R' | 'C' | 'D';
    type AxisName = 'X' | 'Y' | 'Z';
    type DirectionName = 'Up' | 'Down';
    
    // Define actions based on key combinations with proper typing
    const keyActions: Record<ModeName, Record<AxisName, Record<DirectionName, (idx: number) => void>>> = {
      // Rotations (R + axis + direction)
      R: {
        X: {
          Up: (idx) => { this.boundingBoxEditData[idx].rotationX += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].rotationX -= 0.01; }
        },
        Y: {
          Up: (idx) => { this.boundingBoxEditData[idx].rotationY += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].rotationY -= 0.01; }
        },
        Z: {
          Up: (idx) => { this.boundingBoxEditData[idx].rotationZ += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].rotationZ -= 0.01; }
        }
      },
      // Positions/Centers (C + axis + direction)
      C: {
        X: {
          Up: (idx) => { this.boundingBoxEditData[idx].centerX += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].centerX -= 0.01; }
        },
        Y: {
          Up: (idx) => { this.boundingBoxEditData[idx].centerY += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].centerY -= 0.01; }
        },
        Z: {
          Up: (idx) => { this.boundingBoxEditData[idx].centerZ += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].centerZ -= 0.01; }
        }
      },
      // Dimensions (D + axis + direction)
      D: {
        X: {
          Up: (idx) => { this.boundingBoxEditData[idx].dimensionX += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].dimensionX -= 0.01; }
        },
        Y: {
          Up: (idx) => { this.boundingBoxEditData[idx].dimensionY += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].dimensionY -= 0.01; }
        },
        Z: {
          Up: (idx) => { this.boundingBoxEditData[idx].dimensionZ += 0.01; },
          Down: (idx) => { this.boundingBoxEditData[idx].dimensionZ -= 0.01; }
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
      ArrowUp: 'Up',
      ArrowDown: 'Down'
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
    
    // Calculate new vertices based on current properties
    const vertices = this.calculateBoundingBoxVertices(
      boxData.centerX, boxData.centerY, boxData.centerZ,
      boxData.dimensionX, boxData.dimensionY, boxData.dimensionZ,
      boxData.rotationX, boxData.rotationY, boxData.rotationZ
    );
    
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
  }
  
  /**
   * Calculates the 8 vertices of a bounding box based on center, dimensions and rotation
   */
  private calculateBoundingBoxVertices(
    centerX: number, centerY: number, centerZ: number,
    width: number, length: number, height: number,
    rotX: number, rotY: number, rotZ: number
  ): number[][] {
    // Half dimensions
    const hw = width / 2;
    const hl = length / 2;
    const hh = height / 2;
    
    // Define the 8 corners of the box (local coordinates)
    const corners = [
      [-hw, -hl, -hh], // 0: left, back, bottom
      [hw, -hl, -hh],  // 1: right, back, bottom
      [hw, hl, -hh],   // 2: right, front, bottom
      [-hw, hl, -hh],  // 3: left, front, bottom
      [-hw, -hl, hh],  // 4: left, back, top
      [hw, -hl, hh],   // 5: right, back, top
      [hw, hl, hh],    // 6: right, front, top
      [-hw, hl, hh]    // 7: left, front, top
    ];
    
    // Create rotation matrix (using three.js for the math)
    // Order: X -> Y -> Z rotation (intrinsic rotations)
    const rotation = new THREE.Euler(rotX, rotY, rotZ, 'XYZ');
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
    
    // Apply rotation and translation to each corner
    return corners.map(corner => {
      const vertex = new THREE.Vector3(corner[0], corner[1], corner[2]);
      vertex.applyMatrix4(rotationMatrix);
      
      // Translate to center position
      vertex.x += centerX;
      vertex.y += centerY;
      vertex.z += centerZ;
      
      return [vertex.x, vertex.y, vertex.z];
    });
  }
  

  exportBoundingBoxesToJSON() {}

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
        this.boundingBoxEditData.push({
          obj_id: bboxData.obj_id,
          category_name: bboxData.category_name,
          centerX: bboxData.center_cam[0],
          centerY: bboxData.center_cam[1],
          centerZ: bboxData.center_cam[2],
          dimensionX: bboxData.dimensions[0],
          dimensionY: bboxData.dimensions[1],
          dimensionZ: bboxData.dimensions[2],
          rotationX: this.extractRotationX(bboxData.R_cam),
          rotationY: this.extractRotationY(bboxData.R_cam),
          rotationZ: this.extractRotationZ(bboxData.R_cam)
        });
        
        // Create and add individual bounding box
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

  // Helper methods to extract individual rotation angles from a rotation matrix
  extractRotationX(R: any) {
    // Extract rotation around X-axis (pitch)
    return Math.atan2(R[2][1], R[2][2]);
  }

  extractRotationY(R: any) {
    // Extract rotation around Y-axis (yaw)
    return Math.atan2(-R[2][0], Math.sqrt(R[2][1]*R[2][1] + R[2][2]*R[2][2]));
  }

  extractRotationZ(R: any) {
    // Extract rotation around Z-axis (roll)
    return Math.atan2(R[1][0], R[0][0]);
  }
}