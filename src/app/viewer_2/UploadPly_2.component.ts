import { Component, ElementRef, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { GLTFLoader, PLYLoader } from 'three/examples/jsm/Addons.js';
import { CommonModule } from '@angular/common';
import { TrackballControls } from 'three/examples/jsm/Addons.js';
import { ImageViewerComponent } from "../imge_viewer/image_viewer.component";
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

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
  selectedBoundingBoxIndex: number = 0;

  boundingJsonBoxData: BoundingBoxData[] = [];

  private keydownListener: ((event: KeyboardEvent) => void) | null = null;
  private keyupListener: ((event: KeyboardEvent) => void) | null = null;
  private animationFrameId: number | null = null;
  private routeSubscription: Subscription | null = null;

  // Add new properties for folder list management
  private folderList: string[] = [];
  private currentPage: number = 1;
  private readonly STORAGE_KEY = 'folderList';
  private readonly STORAGE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  keyState: any;

  optOutChecked: boolean = false;
  optOutStatus: boolean = false;
  optOutMessage: string = '';
  optOutSuccess: boolean = false;

  private apiBaseUrl = 'http://cvlabhumanrefinement.cs.virginia.edu/api';
  // private apiBaseUrl = 'http://localhost:3000';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) { }

  pointCloudStats: {
    points: number;
    boundingBox: {
      min: THREE.Vector3;
      max: THREE.Vector3;
    }
  } | null = null;

  pointSize: number = 0.05;
  maxDepth: number = 20; // Default maximum depth in meters

  initialRotation: any;
  rotationCenter: THREE.Vector3 = new THREE.Vector3();
  lastDragPosition: any;
  startDragAngle: any;
  // New property for bounding box editing
  boundingBoxEditData: BoundingBoxEditData[] = [];
  basePath: any;
  decoded_path: any;
  private isDepthFileLoaded: boolean = false;
  private isBoundingBoxLoaded: boolean = false;
  private type: string = 'default';

  // Modified ngOnInit to store the subscription
  ngOnInit() {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const encodedPath = params.get('path');
      const bbox_type = params.get('type');
      this.type = bbox_type ? decodeURIComponent(bbox_type) : 'deafult';
      this.basePath = encodedPath ? decodeURIComponent(encodedPath) : '';
      this.loadDataFromPath(this.basePath);
      this.checkOptOutStatus();
    });

    this.initScene();
    this.animate();
    this.setupEventListeners();
    // this.loadFolderList();
  }

  private checkOptOutStatus() {
    if (!this.decoded_path) return;

    const id = this.getDirectoryIdFromPath();
    if (!id) return;

    // Reset state first
    this.optOutChecked = false;
    this.optOutStatus = false;
    this.optOutSuccess = false;
    this.optOutMessage = '';

    fetch(`${this.apiBaseUrl}/assets/val/${id}/deleted.json`)
      .then((response: any) => {
        if (response.ok) {
          return response.json().then((data: any) => {
            this.optOutChecked = true;
            this.optOutStatus = true;
            this.optOutSuccess = true;
            this.optOutMessage = 'This image is marked for deletion';
          });
        } else {
          // If response is not ok (404 or other error), reset state
          this.optOutChecked = false;
          this.optOutStatus = false;
          this.optOutSuccess = false;
          this.optOutMessage = '';
        }
      })
      .catch(() => {
        // File doesn't exist, which is fine
        this.optOutChecked = false;
        this.optOutStatus = false;
        this.optOutSuccess = false;
        this.optOutMessage = '';
      });
  }
  handleSelectKeyDown(event: KeyboardEvent) {
    if (['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      // Handle the arrow key press as needed
    }
  }

  handleOptOut() {
    const id = this.getDirectoryIdFromPath();
    if (!id) {
      this.showOptOutMessage(false, 'Invalid directory path');
      return;
    }

    if (this.optOutChecked) {
      // Create deleted.json file
      const deleteData = { deleted: true, timestamp: new Date().toISOString() };

      fetch(`${this.apiBaseUrl}/api/save/${id}/deleted`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(deleteData)
      })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            this.showOptOutMessage(true, 'Successfully marked for deletion');
          } else {
            this.showOptOutMessage(false, 'Failed to mark for deletion: ' + result.error);
          }
        })
        .catch(error => {
          this.showOptOutMessage(false, 'Network error: ' + error.message);
        });
    } else {
      // Remove the deleted.json file (if API supports it, otherwise maintain local state)
      this.optOutStatus = false;
      this.optOutMessage = '';
      // You might want to add actual file deletion endpoint later
    }
  }

  // Helper method to show opt-out status messages
  private showOptOutMessage(success: boolean, message: string) {
    this.optOutStatus = true;
    this.optOutSuccess = success;
    this.optOutMessage = message;

    // Hide message after 5 seconds
    setTimeout(() => {
      this.optOutStatus = false;
    }, 5000);
  }

  // Helper method to extract directory ID from path
  private getDirectoryIdFromPath(): string | null {
    if (!this.decoded_path) return null;
    const pathParts = this.decoded_path.split('/');
    return pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;
  }


  deleteSelectedBoundingBox() {
    if (this.selectedBoundingBoxIndex === null || this.boundingBoxEditData.length === 0) {
      return;
    }

    // Remove from editing data array
    this.boundingBoxEditData.splice(this.selectedBoundingBoxIndex, 1);

    // Remove from JSON data array for export
    this.boundingJsonBoxData.splice(this.selectedBoundingBoxIndex, 1);

    // Remove from scene
    if (this.boundingBoxMesh instanceof THREE.Group) {
      this.boundingBoxMesh.remove(this.boundingBoxMesh.children[this.selectedBoundingBoxIndex]);
    }

    // If there are no more bounding boxes, handle empty state
    if (this.boundingBoxEditData.length === 0) {
      this.selectedBoundingBoxIndex = -1;
      // Optionally trigger opt-out if no boxes remain
      if (!this.optOutChecked) {
        this.optOutChecked = true;
        this.handleOptOut();
      }
    } else {
      // Select next available box or the last one
      this.selectedBoundingBoxIndex = Math.min(
        this.selectedBoundingBoxIndex,
        this.boundingBoxEditData.length - 1
      );
      this.onBoundingBoxSelect();
    }

    // Update the scene
    this.renderer.render(this.scene, this.camera);
  }

  loadDataFromPath(path: string) {
    try {
      // Reset loading flags
      this.isDepthFileLoaded = false;
      this.isBoundingBoxLoaded = false;

      // Decode the path if it was URL-encoded
      const decodedPath = decodeURIComponent(path);
      this.decoded_path = decodedPath;

      // Extract the folder ID from the path
      const folderId = this.getDirectoryIdFromPath();
      if (!folderId) {
        console.error('Invalid path format');
        return;
      }

      // Load PLY file
      fetch(`${this.apiBaseUrl}/assets/val/${folderId}/depth_scene.ply`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load PLY file: ${response.status} ${response.statusText}`);
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          this.loadPLYFile(arrayBuffer);
          this.isDepthFileLoaded = true;
          this.checkInitializeScene();
        })
        .catch(error => {
          console.error('Error loading PLY file:', error);
        });

      // Load bounding box file
      const file = this.type === 'default' ? '3dbbox_ground_no_icp' : '3dbox_refined';
      fetch(`${this.apiBaseUrl}/assets/val/${folderId}/${file}.json`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load bounding box file: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(jsonData => {
          this.loadBoundingBoxFromJSON(JSON.stringify(jsonData));
          this.isBoundingBoxLoaded = true;
          this.checkInitializeScene();
        })
        .catch(error => {
          console.error('Error loading bounding box file:', error);
        });

    } catch (error) {
      console.error('Error accessing file:', error);
    }
  }

  // New method to check if both files are loaded and initialize the scene
  private checkInitializeScene() {
    if (this.isDepthFileLoaded && this.isBoundingBoxLoaded) {
      console.log('Both files loaded, starting animation');
      // Start animation loop only when both files are loaded
      this.animate();
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
    const gl = this.renderer.getContext();
    gl.lineWidth(20); // This won't always work, but worth trying
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

  // Modified animate method to store the animation frame ID
  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Update trackball controls when not in edit mode
    if (!this.isEditMode) {
      this.trackballControls.update();
    }

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  // Modified setupEventListeners method to store references to listeners
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
          Right: (idx) => { this.applyLocalRotation(idx, 'X', 0.01); },
          Left: (idx) => { this.applyLocalRotation(idx, 'X', -0.01); }
        },
        Y: {
          Right: (idx) => { this.applyLocalRotation(idx, 'Y', 0.01); },
          Left: (idx) => { this.applyLocalRotation(idx, 'Y', -0.01); }
        },
        Z: {
          Right: (idx) => { this.applyLocalRotation(idx, 'Z', 0.01); },
          Left: (idx) => { this.applyLocalRotation(idx, 'Z', -0.01); }
        }
      },
      // Positions/Centers (C + axis + direction)
      C: {
        X: {
          Right: (idx) => { this.applyLocalTranslation(idx, 'X', 0.01); },
          Left: (idx) => { this.applyLocalTranslation(idx, 'X', -0.01); }
        },
        Y: {
          Right: (idx) => { this.applyLocalTranslation(idx, 'Y', 0.01); },
          Left: (idx) => { this.applyLocalTranslation(idx, 'Y', -0.01); }
        },
        Z: {
          Right: (idx) => { this.applyLocalTranslation(idx, 'Z', 0.01); },
          Left: (idx) => { this.applyLocalTranslation(idx, 'Z', -0.01); }
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


    // Define key down handler
    this.keydownListener = (event) => {
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
    };
    this.keyupListener = (event) => {
      if (this.keyState.hasOwnProperty(event.code)) {
        this.keyState[event.code] = false;
      }
    };

    // Add event listeners
    window.addEventListener('keydown', this.keydownListener);
    window.addEventListener('keyup', this.keyupListener);
  }

  // Method for disposing elements
  ngOnDestroy() {
    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Remove event listeners
    if (this.keydownListener) {
      window.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = null;
    }

    if (this.keyupListener) {
      window.removeEventListener('keyup', this.keyupListener);
      this.keyupListener = null;
    }

    // Unsubscribe from route subscription
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
      this.routeSubscription = null;
    }

    // Dispose of THREE.js objects
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      (this.pointCloud.material as THREE.Material).dispose();
      this.pointCloud = null;
    }

    if (this.boundingBoxMesh) {
      this.scene.remove(this.boundingBoxMesh);

      // If it's a group, dispose of all children
      if (this.boundingBoxMesh instanceof THREE.Group) {
        this.boundingBoxMesh.children.forEach((child) => {
          if (child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
      } else if (this.boundingBoxMesh instanceof THREE.LineSegments) {
        this.boundingBoxMesh.geometry.dispose();
        (this.boundingBoxMesh.material as THREE.Material).dispose();
      }

      this.boundingBoxMesh = null;
    }

    // Dispose of TrackballControls
    if (this.trackballControls) {
      this.trackballControls.dispose();
    }

    // Remove axesHelper
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper);
    }

    // Clear the scene
    while (this.scene.children.length > 0) {
      const object = this.scene.children[0];
      this.scene.remove(object);
    }

    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
      // Clear the DOM element
      if (this.rendererContainer && this.rendererContainer.nativeElement) {
        this.rendererContainer.nativeElement.innerHTML = '';
      }
    }
    // Remove local axes helper if it exists
    const localAxesHelper = this.scene.getObjectByName('localAxesHelper');
    if (localAxesHelper) {
      this.scene.remove(localAxesHelper);
    }
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
        material.color.set(0xff0000); // Red
        material.linewidth = 20;
      } else {
        // Make other boxes red
        material.color.set(0x1410eb); // purple
        material.linewidth = 10;
      }
    }

    // Force material update
    setTimeout(() => {
      this.renderer.render(this.scene, this.camera);
      this.updateLocalAxesHelper();
    }, 10);

  }

  private applyLocalRotation(boxIndex: number, axis: 'X' | 'Y' | 'Z', amount: number) {
    const boxData = this.boundingBoxEditData[boxIndex];

    // Create a temporary object to handle the rotations
    const tempObject = new THREE.Object3D();

    // Set initial rotation from boxData
    tempObject.rotation.set(
      boxData.rotationX,
      boxData.rotationY,
      boxData.rotationZ,
      'ZYX'
    );

    // Apply the rotation directly using Object3D's methods
    // This will rotate around the object's local axes
    if (axis === 'X') {
      tempObject.rotateX(amount);
    } else if (axis === 'Y') {
      tempObject.rotateY(amount);
    } else { // Z
      tempObject.rotateZ(amount);
    }

    // The rotateX/Y/Z methods rotate around the local object axes
    // Extract the resulting Euler angles
    boxData.rotationX = tempObject.rotation.x;
    boxData.rotationY = tempObject.rotation.y;
    boxData.rotationZ = tempObject.rotation.z;

    // Update the bounding box
    this.updateBoundingBox();
  }
  private applyLocalTranslation(boxIndex: number, axis: 'X' | 'Y' | 'Z', amount: number) {
    const boxData = this.boundingBoxEditData[boxIndex];

    // Create a quaternion from the current rotation
    const currentRotation = new THREE.Euler(
      boxData.rotationX,
      boxData.rotationY,
      boxData.rotationZ,
      'ZYX'
    );
    const currentQuaternion = new THREE.Quaternion().setFromEuler(currentRotation);

    // Create a displacement vector in local coordinates
    const displacement = new THREE.Vector3();

    // Set displacement along the appropriate local axis
    if (axis === 'X') {
      displacement.set(amount, 0, 0);
    } else if (axis === 'Y') {
      displacement.set(0, amount, 0);
    } else { // Z
      displacement.set(0, 0, amount);
    }

    // Transform displacement to global coordinates based on current rotation
    displacement.applyQuaternion(currentQuaternion);

    // Apply the transformed displacement to the center position
    boxData.centerX += displacement.x;
    boxData.centerY += displacement.y;
    boxData.centerZ += displacement.z;

    this.updateBoundingBox()
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
      this.updateLocalAxesHelper();

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
      new THREE.Vector3(halfL, -halfH, -halfW), // v1
      new THREE.Vector3(halfL, halfH, -halfW), // v2
      new THREE.Vector3(-halfL, halfH, -halfW), // v3
      new THREE.Vector3(-halfL, -halfH, halfW), // v4
      new THREE.Vector3(halfL, -halfH, halfW), // v5
      new THREE.Vector3(halfL, halfH, halfW), // v6
      new THREE.Vector3(-halfL, halfH, halfW)  // v7
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
      const height = v4.distanceTo(v0);  // Z

      const obj_id = bboxData.obj_id;
      const category_name = bboxData.category_name;

      this.boundingJsonBoxData[i].center_cam = center
      this.boundingJsonBoxData[i].dimensions = [length, height, width]
      this.boundingJsonBoxData[i].R_cam = [
        [rotationMatrix.elements[0], rotationMatrix.elements[4], rotationMatrix.elements[8]],
        [rotationMatrix.elements[1], rotationMatrix.elements[5], rotationMatrix.elements[9]],
        [rotationMatrix.elements[2], rotationMatrix.elements[6], rotationMatrix.elements[10]]
      ];
    }

    // Call the API to save the file on the server
    const jsonContent = JSON.stringify(this.boundingJsonBoxData, null, 2);
    const id = this.decoded_path.split('/')[this.decoded_path.split('/').length - 1];

    // Call the API to save the file on the server
    fetch(`${this.apiBaseUrl}/api/save/${id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: jsonContent
    })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          console.log('File saved successfully on server:', result.path);
          alert('File saved');
          // You could display a success message to the user here
        } else {
          console.error('Error saving file:', result.error);
          alert('Error saving file: ' + result.error);
        }
      })
      .catch(error => {
        console.error('Failed to communicate with server:', error);
        alert('Failed to communicate with server: ' + error.message);
      });
  }

  // code to handle file uploads
  onFileUpload(event: Event, type: string) {
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

    // Position camera with 180-degree vertical rotation
    this.camera.position.copy(center);
    this.camera.position.z -= distance; // Move camera to opposite side
    this.camera.up.set(0, -1, 0); // Flip the up vector to rotate view 180 degrees
    this.camera.lookAt(center);

    // Update trackball controls
    this.trackballControls.target.copy(center);
    this.trackballControls.update();

    // Reposition axes helper to object center
    this.axesHelper.position.copy(center);
  }
  private async analyzePLYDepth(arrayBuffer: ArrayBuffer): Promise<number> {
    const loader = new PLYLoader();
    const geometry = loader.parse(arrayBuffer);
    const positions = geometry.getAttribute('position');

    // Calculate distances for all points
    const distances: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );
      const distance = Math.sqrt(vertex.x * vertex.x + vertex.y * vertex.y + vertex.z * vertex.z);
      distances.push(distance);
    }

    // Sort distances to find percentiles
    distances.sort((a, b) => a - b);

    // Calculate statistics
    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
    const stdDev = Math.sqrt(
      distances.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / distances.length
    );

    // Find the 95th percentile
    const percentile95 = distances[Math.floor(distances.length * 0.95)];

    // Calculate a reasonable threshold
    // Use the minimum of:
    // 1. 95th percentile (to remove extreme outliers)
    // 2. mean + 2*stdDev (to remove points beyond 2 standard deviations)
    const threshold = Math.min(percentile95, mean + 2 * stdDev);

    // Ensure the threshold is not too small
    return Math.max(threshold, 20); // Minimum threshold of 20 meters (test)
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

    // Create arrays to store filtered positions
    const filteredPositions = [];
    const filteredColors = [];

    // Get color attribute if it exists
    const colors = geometry.hasAttribute('color') ? geometry.getAttribute('color') : null;

    // Depth limit
    const MAX_DEPTH = 500;

    // Filter points based on depth (z-coordinate)
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Only keep points with depth (z) less than or equal to MAX_DEPTH
      if (Math.abs(z) <= MAX_DEPTH) {
        filteredPositions.push(x, y, z);

        // Also keep the corresponding color if available
        if (colors) {
          filteredColors.push(
            colors.getX(i),
            colors.getY(i),
            colors.getZ(i)
          );
        }
      }
    }

    // Create new geometry with filtered points
    const filteredGeometry = new THREE.BufferGeometry();
    filteredGeometry.setAttribute('position', new THREE.Float32BufferAttribute(filteredPositions, 3));

    // Add color attribute if available
    if (colors && filteredColors.length > 0) {
      filteredGeometry.setAttribute('color', new THREE.Float32BufferAttribute(filteredColors, 3));
    }

    // Prepare color material
    let material: THREE.PointsMaterial;

    // Check if filtered geometry has color attribute
    if (filteredGeometry.hasAttribute('color')) {
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
    this.pointCloud = new THREE.Points(filteredGeometry, material);

    // Update point cloud stats
    filteredGeometry.computeBoundingBox();
    const boundingBox = filteredGeometry.boundingBox;
    if (boundingBox) {
      this.pointCloudStats = {
        points: filteredGeometry.attributes['position'].count,
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
        const height = v4.distanceTo(v0);  // Z

        const obj_id = bboxData.obj_id;
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
      color: isSelected ? 0xff0000 : 0x1410eb, // red if selected, blue otherwise
      linewidth: isSelected ? 20 : 10 // Thicker line if selected
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

  private updateLocalAxesHelper() {
    // Remove existing helper if any
    const existingHelper = this.scene.getObjectByName('localAxesHelper');
    if (existingHelper) this.scene.remove(existingHelper);

    if (this.boundingBoxEditData.length === 0 || this.selectedBoundingBoxIndex < 0) return;

    const boxData = this.boundingBoxEditData[this.selectedBoundingBoxIndex];

    // Create rotation matrix from euler angles
    const rotation = new THREE.Euler(
      boxData.rotationX,
      boxData.rotationY,
      boxData.rotationZ,
      'ZYX'
    );
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);

    // Create axis helpers - use a smaller size than global axes
    const axisLength = Math.max(
      boxData.dimensionX,
      boxData.dimensionY,
      boxData.dimensionZ
    ) * 1.2;

    // Create custom axes helper with thick lines
    const axesGroup = new THREE.Group();
    axesGroup.name = 'localAxesHelper';

    // X axis - red
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, axisLength, 0, 0
    ], 3));
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 10 });
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);

    // Y axis - green
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 0, axisLength, 0
    ], 3));
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 10 });
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);

    // Z axis - blue
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 0, 0, axisLength
    ], 3));
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 10 });
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);

    // Add axes to group
    axesGroup.add(xAxis);
    axesGroup.add(yAxis);
    axesGroup.add(zAxis);

    // Position and rotate the axes helper
    axesGroup.position.set(boxData.centerX, boxData.centerY, boxData.centerZ);
    axesGroup.quaternion.copy(quaternion);

    this.scene.add(axesGroup);

    // Make sure the scene is rendered
    this.renderer.render(this.scene, this.camera);
  }

  // Add new method to load folder list
  private loadFolderList() {
    // Try to get from local storage first
    const storedData = localStorage.getItem(this.STORAGE_KEY);
    if (storedData) {
      const { list, timestamp } = JSON.parse(storedData);
      // Check if data is still valid (not expired)
      if (Date.now() - timestamp < this.STORAGE_EXPIRY) {
        this.folderList = list;
        console.log('Using cached folder list:', this.folderList);
        return;
      }
    }

    // If no valid data in storage, fetch from API
    console.log('Fetching folder list from API...');
    this.http.get<{ success: boolean, structure: { path: string, isFolder: boolean }[] }>(
      `${this.apiBaseUrl}/api/directory?page=1&itemsPerPage=1000`
    ).subscribe({
      next: (response) => {
        if (response.success && response.structure) {
          this.folderList = response.structure
            .filter(item => item.isFolder)
            .map(item => item.path.split('/').pop() || '');

          console.log('Fetched folder list:', this.folderList);
          console.log('Total folders:', this.folderList.length);

          // Store in local storage with timestamp
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            list: this.folderList,
            timestamp: Date.now()
          }));
        }
      },
      error: (error) => {
        console.error('Failed to load folder list:', error);
      }
    });
  }

  async goToPreviousSample() {
    try {
      const currentPath = this.decoded_path;
      const pathParts = currentPath.split('/');
      const currentFolder = pathParts[pathParts.length - 1];

      console.log('Current folder:', currentFolder);
      console.log('Current page:', this.currentPage);

      // Get the current page and folder info from the API
      const response = await fetch(`${this.apiBaseUrl}/api/getindex/${currentFolder}?page=${this.currentPage}`);
      console.log('API Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('API Response data:', data);

      if (!data.success) {
        console.error('Failed to get folder index:', data.error);
        return;
      }

      if (!data.item?.previous) {
        alert('This is the first sample in the list');
        return;
      }

      // Update current page if needed
      this.currentPage = data.currentPage;
      console.log('Updated current page:', this.currentPage);

      // Navigate to the previous sample with the correct path structure
      const encodedPath = encodeURIComponent(`assets/val/${data.item.previous}`);
      console.log('Navigating to:', encodedPath);
      this.router.navigate(['/dashboard', encodedPath, this.type]).then(() => {
        // Check opt-out status after navigation
        this.checkOptOutStatus();
      });
    } catch (error: any) {
      console.error('Error navigating to previous sample:', error);
      alert('Failed to navigate to previous sample: ' + error.message);
    }
  }

  async goToNextSample() {
    try {
      const currentPath = this.decoded_path;
      const pathParts = currentPath.split('/');
      const currentFolder = pathParts[pathParts.length - 1];

      console.log('Current folder:', currentFolder);
      console.log('Current page:', this.currentPage);

      // Get the current page and folder info from the API
      const response = await fetch(`${this.apiBaseUrl}/api/getindex/${currentFolder}?page=${this.currentPage}`);
      console.log('API Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('API Response data:', data);

      if (!data.success) {
        console.error('Failed to get folder index:', data.error);
        return;
      }

      if (!data.item?.next) {
        alert('This is the last sample in the list');
        return;
      }

      // Update current page if needed
      this.currentPage = data.currentPage;
      console.log('Updated current page:', this.currentPage);

      // Navigate to the next sample with the correct path structure
      const encodedPath = encodeURIComponent(`assets/val/${data.item.next}`);
      console.log('Navigating to:', encodedPath);
      this.router.navigate(['/dashboard', encodedPath, this.type]).then(() => {
        // Check opt-out status after navigation
        this.checkOptOutStatus();
      });
    } catch (error: any) {
      console.error('Error navigating to next sample:', error);
      alert('Failed to navigate to next sample: ' + error.message);
    }
  }

  goToHome() {
    // Navigate to home with current page
    this.router.navigate(['/'], { queryParams: { page: this.currentPage } });
  }

  // Add a method to clear existing data
  private clearExistingData() {
    // Clear point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      (this.pointCloud.material as THREE.Material).dispose();
      this.pointCloud = null;
    }

    // Clear bounding boxes
    if (this.boundingBoxMesh) {
      this.scene.remove(this.boundingBoxMesh);
      if (this.boundingBoxMesh instanceof THREE.Group) {
        this.boundingBoxMesh.children.forEach(child => {
          if (child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
      }
      this.boundingBoxMesh = null;
    }

    // Clear data arrays
    this.boundingBoxEditData = [];
    this.boundingJsonBoxData = [];
    this.selectedBoundingBoxIndex = 0;
  }
}