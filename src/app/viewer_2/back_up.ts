// back up of the original ts file
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

enum CornerEditMode {
  None,
  Width,  // X dimension
  Length, // Y dimension
  Height, // Z dimension
  Center, // Move entire box
  RotationX, // Rotate around X axis
  RotationY, // Rotate around Y axis
  RotationZ  // Rotate around Z axis
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
  private glbModel: THREE.Group | null = null;
  private boundingBoxMesh: THREE.LineSegments | null = null;
  private boundingBoxCorners: THREE.Mesh[] = [];
  private rotationRings: THREE.Mesh[] = [];  // Array to store the three rotation rings

  private axesHelper!: THREE.AxesHelper;
  isEditMode = false;
  selectedBoundingBoxIndex : number = 0;

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

  private cornerEditMode: CornerEditMode = CornerEditMode.None;
  private originalCornerPositions: THREE.Vector3[] = [];
  private startDragPosition: THREE.Vector3 = new THREE.Vector3();
  private initialScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1); // Store initial normalized scale
  
  // Store rotation-specific data
  private rotationStartQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private rotationAxis: THREE.Vector3 = new THREE.Vector3();
  private rotationRingRadius: number = 1;  // Will be dynamically set based on box size
  
  private cornerColors = {
    width: 0xff0000,   // Red for width (X)
    length: 0x00ff00,  // Green for length (Y)
    height: 0x0000ff,  // Blue for height (Z)
    center: 0xffff00,  // Yellow for center
    rotationX: 0xff0000, // Red for X-axis rotation
    rotationY: 0x00ff00, // Green for Y-axis rotation
    rotationZ: 0x0000ff  // Blue for Z-axis rotation
  };

  private selectedCorner: THREE.Mesh | null = null;
  private selectedRing: THREE.Mesh | null = null;
  initialRotation: any;
  rotationCenter: THREE.Vector3 = new THREE.Vector3();
  lastDragPosition: any;
  startDragAngle: any;
  // New property for bounding box editing
  boundingBoxEditData: BoundingBoxEditData[] = [];

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
    window.addEventListener('keydown', this.onKeyDown);
    this.rendererContainer.nativeElement.addEventListener('mousedown', this.onMouseDown);
    this.rendererContainer.nativeElement.addEventListener('mousemove', this.onMouseMove);
    this.rendererContainer.nativeElement.addEventListener('mouseup', this.onMouseUp);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    // Shift key to toggle edit mode
    if (event.code == 'KeyR') {
      console.log('event.code')
      this.toggleEditMode('Rotation');
    } else if (event.code === 'KeyD') {
      this.toggleEditMode('dimensions');
    }

    // Space key to exit edit mode if in edit mode
    if (event.code === 'Space' && this.isEditMode) {
      this.toggleEditMode('clear');
    }
  }

  private toggleEditMode(type: string) {
    if (type === 'clear'){
      this.isEditMode = false;
    } else {
      this.isEditMode = true;
    }

    if (this.isEditMode) {
      // Disable trackball controls when in edit mode
      this.trackballControls.enabled = false;
      if (type === 'Rotation'){
        this.createRotationRings();
      } else if (type === 'dimensions') {
        this.createBoundingBoxCorners();
      }
    } else {
      // Re-enable trackball controls when exiting edit mode
      this.trackballControls.enabled = true;
      this.removeBoundingBoxCorners();
      this.removeRotationRings();
    }
  }



  // Update your onMouseDown method to handle both corners and rings
  private onMouseDown = (event: MouseEvent) => {
    if (!this.isEditMode) return;

    // Calculate mouse position in normalized device coordinates
    const container = this.rendererContainer.nativeElement;
    this.mouse.x = (event.clientX / container.clientWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / container.clientHeight) * 2 + 1;

    // Set up the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Reset selections
    this.selectedCorner = null;
    this.selectedRing = null;
    
    // First check for intersections with rotation rings (give priority)
    const ringIntersects = this.raycaster.intersectObjects(this.rotationRings);
    
    if (ringIntersects.length > 0) {
      this.selectedRing = ringIntersects[0].object as THREE.Mesh;
      const ringIndex = this.rotationRings.indexOf(this.selectedRing);
      
      // Get center of bounding box
      if (this.boundingBoxEditData[this.selectedBoundingBoxIndex]) {
        this.rotationCenter = new THREE.Vector3(
          this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX,
          this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY,
          this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ
        );
      } else {
        return; // No bounding box data available
      }
      
      // Set edit mode and rotation axis based on ring index (0: X, 1: Y, 2: Z)
      switch (ringIndex) {
        case 0:
          this.cornerEditMode = CornerEditMode.RotationX;
          this.rotationAxis.set(1, 0, 0);
          break;
        case 1:
          this.cornerEditMode = CornerEditMode.RotationY;
          this.rotationAxis.set(0, 1, 0);
          break;
        case 2:
          this.cornerEditMode = CornerEditMode.RotationZ;
          this.rotationAxis.set(0, 0, 1);
          break;
      }
      
      // Store hit point on the ring for rotation calculations
      this.startDragPosition = ringIntersects[0].point.clone();
      
      // Calculate and store the initial angle for relative calculations
      this.startDragAngle = this.calculateAngleOnRing(this.startDragPosition.clone());
      
      // Store initial rotation values
      this.initialRotation = {
        x: this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationX,
        y: this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationY,
        z: this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationZ
      };
      
      return; // Exit early if we've selected a ring
    }
    
    // Otherwise check for corner intersections (as before)
    const cornerIntersects = this.raycaster.intersectObjects(this.boundingBoxCorners);

    if (cornerIntersects.length > 0) {
      this.selectedCorner = cornerIntersects[0].object as THREE.Mesh;
      this.cornerEditMode = this.selectedCorner.userData['editMode'];
      
      // Store the starting drag position for calculations
      this.startDragPosition = this.selectedCorner.position.clone();
    }
  }

  // Updated mouse move handler to handle both corner and ring interactions
  private onMouseMove = (event: MouseEvent) => {
    if (!this.isEditMode || (!this.selectedCorner && !this.selectedRing) || !this.boundingBoxMesh || !this.boundingBoxEditData[this.selectedBoundingBoxIndex]) return;

    // Calculate mouse position in normalized device coordinates
    const container = this.rendererContainer.nativeElement;
    this.mouse.x = (event.clientX / container.clientWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / container.clientHeight) * 2 + 1;

    // Raycast to find the new position
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this.mouse, this.camera);
    
    if (this.selectedRing) {
      // Handle rotation ring interaction
      this.handleRingRotation(raycaster);
    } else if (this.selectedCorner) {
      // Handle corner interaction (as before)
      this.handleCornerMove(raycaster);
    }
    
    // Recreate the bounding box with updated parameters
    this.recreateBoundingBoxFromParameters();
    
    // Update rotation rings position and orientation
    if (this.rotationRings.length > 0) {
      this.updateRotationRingsTransform();
    }
  }
  
  // New method to handle rotation ring interaction
  private handleRingRotation(raycaster: THREE.Raycaster) {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || !this.selectedRing || !this.rotationCenter) return;
    
    // Create a plane perpendicular to camera but passing through rotation center
    const planeNormal = this.camera.position.clone().sub(this.rotationCenter).normalize();
    const plane = new THREE.Plane(planeNormal, -planeNormal.dot(this.rotationCenter));
    
    // Find intersection point with the plane
    const intersectionPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
      // Project intersection point onto the ring's plane
      const ringPlane = new THREE.Plane(this.rotationAxis, -this.rotationAxis.dot(this.rotationCenter));
      const projectedPoint = intersectionPoint.clone()
        .sub(this.rotationAxis.clone().multiplyScalar(intersectionPoint.dot(this.rotationAxis)))
        .add(this.rotationAxis.clone().multiplyScalar(this.rotationCenter.dot(this.rotationAxis)));
      
      // Calculate the current angle on the ring
      const currentAngle = this.calculateAngleOnRing(projectedPoint);
      
      // Calculate the angle difference
      let angleDifference = currentAngle - this.startDragAngle;
      
      // Convert to degrees
      const angleDegreesDifference = angleDifference * (180 / Math.PI);
      
      // Apply rotation based on the axis
      // We use the initialRotation as reference to avoid accumulation errors
      switch (this.cornerEditMode) {
        case CornerEditMode.RotationX:
          this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationX = this.initialRotation.x + angleDegreesDifference;
          break;
        case CornerEditMode.RotationY:
          this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationY = this.initialRotation.y + angleDegreesDifference;
          break;
        case CornerEditMode.RotationZ:
          this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationZ = this.initialRotation.z + angleDegreesDifference;
          break;
      }
      
      // Update bounding box visual representation
      this.updateBoundingBoxMesh();
    }
  }
  private updateBoundingBoxMesh() {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || !this.boundingBoxMesh) return;
    
    // Update the bounding box mesh rotation
    this.boundingBoxMesh.rotation.set(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationX * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationY * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationZ * (Math.PI / 180)
    );
    
    // Update the rotation rings to match the new orientation
    this.updateRotationRings();
  }
  
  // Method to update rotation rings to match current bounding box orientation
  private updateRotationRings() {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || this.rotationRings.length !== 3) return;
    
    const center = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ
    );
    
    // Get current rotation as a matrix
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationX * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationY * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationZ * (Math.PI / 180)
    ));
    
    // Update position and rotation of each ring
    const xRing = this.rotationRings[0];
    const yRing = this.rotationRings[1];
    const zRing = this.rotationRings[2];
    
    // Update positions
    xRing.position.copy(center);
    yRing.position.copy(center);
    zRing.position.copy(center);
    
    // Create local rotation axes
    const xAxis = new THREE.Vector3(1, 0, 0).applyMatrix4(rotationMatrix);
    const yAxis = new THREE.Vector3(0, 1, 0).applyMatrix4(rotationMatrix);
    const zAxis = new THREE.Vector3(0, 0, 1).applyMatrix4(rotationMatrix);
    
    // Set orientations
    // This ensures rings always remain perpendicular to their respective axes
    this.setRingOrientation(xRing, xAxis);
    this.setRingOrientation(yRing, yAxis);
    this.setRingOrientation(zRing, zAxis);
  }
  
  // Helper method to orient a ring perpendicular to an axis
  private setRingOrientation(ring: THREE.Mesh, axis: THREE.Vector3) {
    // Create a quaternion that aligns the ring's normal with the axis
    const quaternion = new THREE.Quaternion();
    
    // Default ring normal is (0,0,1) in its local space
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    
    // Set quaternion to rotate from default normal to desired axis
    quaternion.setFromUnitVectors(defaultNormal, axis.clone().normalize());
    
    // Apply quaternion to ring
    ring.quaternion.copy(quaternion);
  }

  private calculateAngleOnRing(point: THREE.Vector3): number {
    // Get vector from center to point
    const toPoint = point.clone().sub(this.rotationCenter);
    
    // Project onto the plane perpendicular to the rotation axis
    toPoint.projectOnPlane(this.rotationAxis);
    
    if (toPoint.length() < 0.001) return 0; // Too close to axis
    
    // Determine reference vector based on axis
    let referenceVector = new THREE.Vector3();
    let secondaryVector = new THREE.Vector3();
    
    if (this.rotationAxis.equals(new THREE.Vector3(1, 0, 0))) {
      // X-axis rotation
      referenceVector.set(0, 0, 1);
      secondaryVector.set(0, 1, 0);
    } else if (this.rotationAxis.equals(new THREE.Vector3(0, 1, 0))) {
      // Y-axis rotation
      referenceVector.set(1, 0, 0);
      secondaryVector.set(0, 0, 1);
    } else {
      // Z-axis rotation
      referenceVector.set(1, 0, 0);
      secondaryVector.set(0, 1, 0);
    }
    
    // Normalize vector
    toPoint.normalize();
    
    // Calculate angle using atan2 for correct quadrant
    const angle = Math.atan2(
      toPoint.dot(secondaryVector),
      toPoint.dot(referenceVector)
    );
    
    return angle;
  }
  
  // Method to handle corner move (renamed from updateDimension, updateCenter, etc.)
  private handleCornerMove(raycaster: THREE.Raycaster) {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || !this.selectedCorner) return;
    
    // Create a plane appropriate for the current edit mode
    let plane;
    const center = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ
    );
    
    switch (this.cornerEditMode) {
      case CornerEditMode.Width:
        // For width editing, create a plane perpendicular to Y-Z plane
        plane = new THREE.Plane(new THREE.Vector3(0, 0, 1).cross(new THREE.Vector3(0, 1, 0)).normalize());
        break;
      case CornerEditMode.Length:
        // For length editing, create a plane perpendicular to X-Z plane
        plane = new THREE.Plane(new THREE.Vector3(1, 0, 0).cross(new THREE.Vector3(0, 0, 1)).normalize());
        break;
      case CornerEditMode.Height:
        // For height editing, create a plane perpendicular to X-Y plane
        plane = new THREE.Plane(new THREE.Vector3(1, 0, 0).cross(new THREE.Vector3(0, 1, 0)).normalize());
        break;
      case CornerEditMode.Center:
        // For center movement, create a plane perpendicular to camera direction
        const cameraDirection = this.camera.getWorldDirection(new THREE.Vector3());
        plane = new THREE.Plane(cameraDirection);
        break;
      default:
        return; // Exit for unhandled cases
    }
    
    // Position the plane at the corner's position
    plane.translate(this.selectedCorner.position);
    
    // Find intersection point with the plane
    const intersectionPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
      // Handle based on the edit mode
      switch (this.cornerEditMode) {
        case CornerEditMode.Width:
          this.updateDimensionMaintainingNormalizedScale(intersectionPoint, 'x');
          break;
        case CornerEditMode.Length:
          this.updateDimensionMaintainingNormalizedScale(intersectionPoint, 'y');
          break;
        case CornerEditMode.Height:
          this.updateDimensionMaintainingNormalizedScale(intersectionPoint, 'z');
          break;
        case CornerEditMode.Center:
          this.updateCenter(intersectionPoint);
          break;
      }
      
      // Update the control point position to follow the mouse
      this.selectedCorner.position.copy(intersectionPoint);
    }
  }

  private updateDimensionMaintainingNormalizedScale(newPosition: THREE.Vector3, axis: 'x' | 'y' | 'z') {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || !this.selectedCorner ) return;
    
    // Calculate the difference from starting position
    const delta = newPosition[axis] - this.startDragPosition[axis];
    
    // Update only the dimension for the specified axis
    switch (axis) {
      case 'x':
        const newDimensionX = Math.max(0.1, this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionX + delta * 2);
        this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionX = newDimensionX;
        break;
        
      case 'y':
        const newDimensionY = Math.max(0.1, this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionY + delta * 2);
        this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionY = newDimensionY;
        break;
        
      case 'z':
        const newDimensionZ = Math.max(0.1, this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionZ + delta * 2);
        this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionZ = newDimensionZ;
        break;
    }
  }
  
  private updateCenter(newPosition: THREE.Vector3) {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || !this.selectedCorner) return;
    
    // Calculate the difference from starting position
    const deltaX = newPosition.x - this.startDragPosition.x;
    const deltaY = newPosition.y - this.startDragPosition.y;
    const deltaZ = newPosition.z - this.startDragPosition.z;
    
    // Update the center position
    this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX = this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX + deltaX;
    this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY = this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY + deltaY;
    this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ = this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ + deltaZ;
  }
  
  private recreateBoundingBoxFromParameters() {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || !this.boundingBoxMesh) return;
    
    // Get parameters
    const center = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ
    );
    
    const dimensions = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionZ
    );
    console.log(dimensions)
    
    const rotation = new THREE.Euler(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationX * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationY * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationZ * (Math.PI / 180)
    );
    
    // Create vertices for bounding box
    const halfWidth = dimensions.x / 2;
    const halfHeight = dimensions.y / 2;
    const halfDepth = dimensions.z / 2;
    
    // Define the 8 corners of the box (local coordinates)
    const vertices = [
      new THREE.Vector3(-halfWidth, -halfHeight, -halfDepth),  // 0: left front bottom
      new THREE.Vector3(halfWidth, -halfHeight, -halfDepth),   // 1: right front bottom
      new THREE.Vector3(halfWidth, -halfHeight, halfDepth),    // 2: right back bottom
      new THREE.Vector3(-halfWidth, -halfHeight, halfDepth),   // 3: left back bottom
      new THREE.Vector3(-halfWidth, halfHeight, -halfDepth),   // 4: left front top
      new THREE.Vector3(halfWidth, halfHeight, -halfDepth),    // 5: right front top
      new THREE.Vector3(halfWidth, halfHeight, halfDepth),     // 6: right back top
      new THREE.Vector3(-halfWidth, halfHeight, halfDepth)     // 7: left back top
    ];
    
    // Create rotation matrix
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
    
    // Apply rotation and translation to each vertex
    const transformedVertices = vertices.map(vertex => {
      const rotated = vertex.clone().applyMatrix4(rotationMatrix);
      return [
        rotated.x + center.x,
        rotated.y + center.y,
        rotated.z + center.z
      ];
    }).flat();
    
    // Define edges
    const edgeIndices = [
      0, 1, 1, 2, 2, 3, 3, 0,  // Bottom face
      4, 5, 5, 6, 6, 7, 7, 4,  // Top face
      0, 4, 1, 5, 2, 6, 3, 7   // Connecting edges
    ];
    
    // Create line segments geometry
    const edgeVertices = edgeIndices.map(index => {
      const i = index * 3;
      return [transformedVertices[i], transformedVertices[i+1], transformedVertices[i+2]];
    }).flat();
    
    // Update the bounding box mesh
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
    
    // Remove old mesh and create new one
    this.scene.remove(this.boundingBoxMesh);
    this.boundingBoxMesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
    );
    this.scene.add(this.boundingBoxMesh);
    
    // Update control point positions based on new box dimensions
    this.updateControlPointPositions();
  }
  
  // Method to update control point positions after box is modified
  private updateControlPointPositions() {
    if (!this.boundingBoxCorners.length || !this.boundingBoxMesh) return;
    
    // Get up-to-date box parameters
    const center = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex]!.centerX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex]!.centerY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex]!.centerZ
    );
    
    const dimensions = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex]!.dimensionX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex]!.dimensionY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex]!.dimensionZ
    );
    
    // Get the box geometry
    const geometry = this.boundingBoxMesh.geometry;
    const positions = geometry.getAttribute('position');
    
    // Find unique vertices (8 corners from 24 positions in the line segments)
    const uniqueVertices = new Map<string, THREE.Vector3>();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
      
      if (!uniqueVertices.has(key)) {
        uniqueVertices.set(key, new THREE.Vector3(x, y, z));
      }
    }
    
    const vertices = Array.from(uniqueVertices.values());
    
    // Update width control (red) - right front bottom
    if (this.boundingBoxCorners[0]) {
      // Find the vertex with max X, min Y, min Z
      const rightFrontBottom = vertices.reduce((best, v) => {
        if (v.x > best.x) return v;
        return best;
      }, new THREE.Vector3(-Infinity, 0, 0));
      
      this.boundingBoxCorners[0].position.copy(rightFrontBottom);
    }
    
    // Update length control (green) - left back bottom
    if (this.boundingBoxCorners[1]) {
      // Find the vertex with min X, min Y, max Z
      const leftBackBottom = vertices.reduce((best, v) => {
        if (v.z > best.z) return v;
        return best;
      }, new THREE.Vector3(0, 0, -Infinity));
      
      this.boundingBoxCorners[1].position.copy(leftBackBottom);
    }
    
    // Update height control (blue) - left front top
    if (this.boundingBoxCorners[2]) {
      // Find the vertex with min X, max Y, min Z
      const leftFrontTop = vertices.reduce((best, v) => {
        if (v.y > best.y) return v;
        return best;
      }, new THREE.Vector3(0, -Infinity, 0));
      
      this.boundingBoxCorners[2].position.copy(leftFrontTop);
    }
    
    // Update center control (yellow)
    if (this.boundingBoxCorners[3]) {
      this.boundingBoxCorners[3].position.copy(center);
    }
  }
  
  

  private onMouseUp = () => {
    this.selectedCorner = null;
    this.selectedRing = null;
    this.lastDragPosition = null;
    this.cornerEditMode = CornerEditMode.None;
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


  // Codes for creating rotation rings around the object 

  private createRotationRings() {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex]) return;
    
    // Clear any existing rings
    this.rotationRings.forEach(ring => {
      this.scene.remove(ring);
    });
    this.rotationRings = [];
    
    const center = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ
    );
    
    // Size ring based on bounding box dimensions
    const radius = Math.max(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionZ
    ) * 0.5;
    
    // Create X-axis ring (red)
    const xRingGeometry = new THREE.TorusGeometry(radius, radius * 0.1, 16, 64);
    const xRingMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const xRing = new THREE.Mesh(xRingGeometry, xRingMaterial);
    xRing.position.copy(center);
    xRing.rotation.set(Math.PI/2, 0, 0); // Rotate to align with YZ plane
    this.scene.add(xRing);
    this.rotationRings.push(xRing);
    
    // Create Y-axis ring (green)
    const yRingGeometry = new THREE.TorusGeometry(radius, radius * 0.1, 16, 64);
    const yRingMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const yRing = new THREE.Mesh(yRingGeometry, yRingMaterial);
    yRing.position.copy(center);
    yRing.rotation.set(0, 0, Math.PI/2); // Rotate to align with XZ plane
    this.scene.add(yRing);
    this.rotationRings.push(yRing);
    
    // Create Z-axis ring (blue)
    const zRingGeometry = new THREE.TorusGeometry(radius, radius * 0.1, 16, 64);
    const zRingMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide });
    const zRing = new THREE.Mesh(zRingGeometry, zRingMaterial);
    zRing.position.copy(center);
    // Z ring is already aligned with XY plane
    this.scene.add(zRing);
    this.rotationRings.push(zRing);
    
    // Update ring orientations based on current bounding box rotation
    this.updateRotationRings();
  }
  
  // Update this method to properly align the rings with the bounding box
  private updateRotationRingsTransform() {
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex] || this.rotationRings.length !== 3) return;
        
    // Get the center of the bounding box
    const center = new THREE.Vector3( this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX, this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY, this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ);
    
    // Apply position to all rings
    this.rotationRings.forEach(ring => {
      ring.position.copy(center);
    });
    
    // Apply rotation to match the bounding box orientation
    const boxRotation = new THREE.Euler(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationZ,
      'XYZ'
    );
    
    // X rotation ring (around YZ plane)
    this.rotationRings[0].setRotationFromEuler(new THREE.Euler(
      0,
      Math.PI/2,
      0,
      'XYZ'
    ));
    this.rotationRings[0].applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(boxRotation));
    
    // Y rotation ring (around XZ plane)
    this.rotationRings[1].setRotationFromEuler(new THREE.Euler(
      Math.PI/2,
      0,
      0,
      'XYZ'
    ));
    this.rotationRings[1].applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(boxRotation));
    
    // Z rotation ring (around XY plane)
    this.rotationRings[2].setRotationFromEuler(new THREE.Euler(
      0,
      0,
      0,
      'XYZ'
    ));
    this.rotationRings[2].applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(boxRotation));
  }

  // code to add corner for editing to boundign box
  private createBoundingBoxCorners() {
    // Clear any existing corners
    this.removeBoundingBoxCorners();

    console.log(this.selectedBoundingBoxIndex)
    
    if (!this.boundingBoxEditData[this.selectedBoundingBoxIndex]) return;
    
    // Get current box parameters
    const center = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].centerZ
    );
    
    const dimensions = new THREE.Vector3(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionX,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionY,
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].dimensionZ
    );
    
    const rotation = new THREE.Euler(
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationX * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationY * (Math.PI / 180),
      this.boundingBoxEditData[this.selectedBoundingBoxIndex].rotationZ * (Math.PI / 180)
    );
    
    // Create rotation matrix for vertices
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
    
    // Calculate half-dimensions
    const halfWidth = dimensions.x / 2;
    const halfHeight = dimensions.y / 2;
    const halfDepth = dimensions.z / 2;
    

    
    // Create control vertices
    const vertices = [
      new THREE.Vector3(halfWidth, -halfHeight, -halfDepth),   // 0: Right front bottom (Width)
      new THREE.Vector3(-halfWidth, -halfHeight, halfDepth),   // 1: Left back bottom (Length)
      new THREE.Vector3(-halfWidth, halfHeight, -halfDepth),   // 2: Left front top (Height)
      center.clone(),                                          // 3: Center
    ];
    
    // Apply rotation to each vertex (except center)
    for (let i = 0; i < 3; i++) {
      vertices[i].applyMatrix4(rotationMatrix);
      vertices[i].add(center); // Translate to final position
    }
    
    // Create corner meshes with different colors
    const cornerGeometry = new THREE.SphereGeometry(0.05 * Math.max(dimensions.x, dimensions.y, dimensions.z));
    
    // Width control (red)
    const widthMaterial = new THREE.MeshBasicMaterial({ color: this.cornerColors.width });
    const widthCorner = new THREE.Mesh(cornerGeometry, widthMaterial);
    widthCorner.position.copy(vertices[0]);
    widthCorner.userData = { editMode: CornerEditMode.Width };
    
    // Length control (green)
    const lengthMaterial = new THREE.MeshBasicMaterial({ color: this.cornerColors.length });
    const lengthCorner = new THREE.Mesh(cornerGeometry, lengthMaterial);
    lengthCorner.position.copy(vertices[1]);
    lengthCorner.userData = { editMode: CornerEditMode.Length };
    
    // Height control (blue)
    const heightMaterial = new THREE.MeshBasicMaterial({ color: this.cornerColors.height });
    const heightCorner = new THREE.Mesh(cornerGeometry, heightMaterial);
    heightCorner.position.copy(vertices[2]);
    heightCorner.userData = { editMode: CornerEditMode.Height };
    
    // Center control (yellow)
    const centerMaterial = new THREE.MeshBasicMaterial({ color: this.cornerColors.center });
    const centerCorner = new THREE.Mesh(cornerGeometry, centerMaterial);
    centerCorner.position.copy(vertices[3]);
    centerCorner.userData = { editMode: CornerEditMode.Center };
    
    // Add corners to the scene and store them
    this.boundingBoxCorners.push(widthCorner, lengthCorner, heightCorner, centerCorner);
    
    for (const corner of this.boundingBoxCorners) {
      this.scene.add(corner);
    }
  }
  
  // Method for disposing elements
  ngOnDestroy() {
    // Clean up event listeners
    window.removeEventListener('keydown', this.onKeyDown);
    
    const container = this.rendererContainer.nativeElement;
    if (container) {
      container.removeEventListener('mousedown', this.onMouseDown);
      container.removeEventListener('mousemove', this.onMouseMove);
      container.removeEventListener('mouseup', this.onMouseUp);
    }
    
    // Dispose of Three.js resources
    this.dispose();
  }
  private dispose() {
    // Dispose of geometries, materials, and textures
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      if (this.pointCloud.material instanceof THREE.Material) {
        this.pointCloud.material.dispose();
      }
    }
    
    if (this.boundingBoxMesh) {
      this.scene.remove(this.boundingBoxMesh);
      this.boundingBoxMesh.geometry.dispose();
      if (this.boundingBoxMesh.material instanceof THREE.Material) {
        this.boundingBoxMesh.material.dispose();
      }
    }
    
    // Remove control points
    this.removeBoundingBoxCorners();
    
    // Remove rotation rings
    this.removeRotationRings();
    
    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
  private removeBoundingBoxCorners() {
    // Remove each corner from the scene
    for (const corner of this.boundingBoxCorners) {
      this.scene.remove(corner);
      // Dispose of geometries and materials to prevent memory leaks
      if (corner.geometry) corner.geometry.dispose();
      if (corner.material) {
        if (Array.isArray(corner.material)) {
          corner.material.forEach(mat => mat.dispose());
        } else {
          corner.material.dispose();
        }
      }
    }
    
    // Clear the array
    this.boundingBoxCorners = [];
  }
  private removeRotationRings() {
    // Remove each rotation ring from the scene
    for (const ring of this.rotationRings) {
      this.scene.remove(ring);
      // Dispose of geometries and materials to prevent memory leaks
      if (ring.geometry) ring.geometry.dispose();
      if (ring.material) {
        if (Array.isArray(ring.material)) {
          ring.material.forEach(mat => mat.dispose());
        } else {
          ring.material.dispose();
        }
      }
    }
    
    // Clear the array
    this.rotationRings = [];
  }

  onBoundingBoxSelect() {}
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
    }
  
    try {
      const data: BoundingBoxData[] = JSON.parse(jsonContent);
      
      if (data.length === 0) {
        console.warn('No bounding box data found in JSON');
        return;
      }
  
      // Use the first bounding box in the file
      for(let i = 0; i < data.length; i++){
        const bboxData = data[i];
        
        // Extract vertices from bbox3D_cam
        const bbox3D = bboxData.bbox3D_cam;
        const flatVertices: number[] = [];
        bbox3D.forEach(vertex => {
          flatVertices.push(vertex[0], vertex[1], vertex[2]);
        });

    
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
        })
    
        this.createBoundingBoxMesh(flatVertices);
      }
      
    } catch (error) {
      console.error('Error parsing JSON:', error);
    }
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