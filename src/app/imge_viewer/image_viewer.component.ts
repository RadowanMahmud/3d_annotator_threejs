// cube-viewer.component.ts
import { Component, OnInit, ViewChild, ElementRef, Inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CubeRendererService } from '../services/cube_renderer_service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

interface Cube {
  bbox3D_cam: number[][];
  category_name: string;
  // Add other properties as needed
}

interface CameraParams {
  K: number[][];
  // Add other properties as needed
}

@Component({
  selector: 'app-image-viewer',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './image_viewer.component.html',
  styleUrls: ['./image_viewer.component.css'],
})
export class ImageViewerComponent implements OnInit, OnChanges  {
  @ViewChild('cubeCanvas', { static: true }) canvasElement!: ElementRef<HTMLCanvasElement>;
  @Input() cubeList: any | null = null;
  @Input() imagePath: any | null = null;

  
  isLoading = false;
  error: string | null = null;
  sceneDir = 'assets/scene_data'; // Default scene directory path
  isGround = false; // Default to use predicted bounding boxes
  camera_intrinsic: number[][] | null = null;
  uploadedImage: HTMLImageElement | null = null;

  constructor(@Inject(CubeRendererService) private cubeRenderer: CubeRendererService) {}

  ngOnInit(): void {
    if (this.imagePath) {
      this.onImageload(this.imagePath)
      this.onJSONCameraParamsFileUpload(this.imagePath)
      this.drawCube
    }

    // We'll wait for the image and cubeList before rendering
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log(changes)
    // Check if cubeList changed and is not the first change (initialization)
    if (changes['cubeList'] && this.uploadedImage && this.camera_intrinsic) {
      // Only draw cubes if we have the required data (image and camera params)
      this.drawCube();
    }
  }
  


  drawCube(): void {
    if (!this.uploadedImage) {
      this.error = "Please upload an image first";
      return;
    }

    if (!this.camera_intrinsic) {
      this.error = "Please upload camera parameters first";
      return;
    }

    if (!this.cubeList || this.cubeList.length === 0) {
      this.error = "No cube data available";
      return;
    }

    this.isLoading = true;
    this.error = null;

    // Create camera params object
    const cameraParams: CameraParams = {
      K: this.camera_intrinsic
    };

    // Call the new drawCube method directly
    this.drawCubeOnImage(this.uploadedImage, cameraParams, this.cubeList)
      .subscribe({
        next: (canvas) => {
          // Copy the contents of the returned canvas to our component's canvas
          const ourCanvas = this.canvasElement.nativeElement;
          ourCanvas.width = canvas.width;
          ourCanvas.height = canvas.height;
          const ctx = ourCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(canvas, 0, 0);
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error rendering cube:', err);
          this.error = 'Failed to render cube. Please check the console for details.';
          this.isLoading = false;
        }
      });
  }

  drawCubeOnImage(
    img: HTMLImageElement,
    cameraParams: CameraParams,
    cubeList: Cube[]
  ): Observable<HTMLCanvasElement> {
    return new Observable<HTMLCanvasElement>((observer) => {
      try {
        // Create canvas and draw everything
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          observer.error('Could not get canvas context');
          return;
        }
        
        // Draw the original image
        ctx.drawImage(img, 0, 0);
        
        // Draw each cube using the provided camera intrinsic K
        const K = cameraParams.K;
        for (const cube of cubeList) {
          // Project 3D points to 2D
          const verts = cube.bbox3D_cam;
          const points2D = verts.map(point => this.projectTo2D(point, K));
          
          // Find topmost point for text placement
          let minY = Infinity;
          let topmostPoint: [number, number] | null = null;
          
          for (const point of points2D) {
            if (point[1] < minY) {
              minY = point[1];
              topmostPoint = point;
            }
          }
          
          // Draw points
          for (const point of points2D) {
            ctx.beginPath();
            ctx.arc(point[0], point[1], 3, 0, 2 * Math.PI);
            ctx.fillStyle = 'green';
            ctx.fill();
          }
          
          // Define the edges of a cube
          const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
          ];
          
          // Draw edges
          ctx.strokeStyle = 'blue';
          ctx.lineWidth = 2;
          for (const [startIdx, endIdx] of edges) {
            const startPoint = points2D[startIdx];
            const endPoint = points2D[endIdx];
            
            ctx.beginPath();
            ctx.moveTo(startPoint[0], startPoint[1]);
            ctx.lineTo(endPoint[0], endPoint[1]);
            ctx.stroke();
          }
          
          // Draw category name
          if (topmostPoint) {
            ctx.fillStyle = 'red';
            ctx.font = '14px Arial';
            ctx.fillText(cube.category_name, topmostPoint[0], topmostPoint[1] - 10);
          }
        }
        
        observer.next(canvas);
        observer.complete();
      } catch (err) {
        observer.error(err);
      }
    });
  }

  // Helper method to project 3D points to 2D using camera intrinsics
  projectTo2D(point: number[], K: number[][]): [number, number] {
    // Camera projection: [u, v, 1]^T = K * [X, Y, Z]^T / Z
    const X = point[0];
    const Y = point[1];
    const Z = point[2];
    
    if (Z <= 0) {
      return [0, 0]; // Point is behind the camera
    }
    
    const u = (K[0][0] * X + K[0][1] * Y + K[0][2] * Z) / Z;
    const v = (K[1][0] * X + K[1][1] * Y + K[1][2] * Z) / Z;
    
    return [u, v];
  }

  saveImage(): void {
    const canvas = this.canvasElement.nativeElement;
    const link = document.createElement('a');
    link.download = `cube_render_${this.isGround ? 'ground' : 'pred'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  toggleGroundTruth(): void {
    this.isGround = !this.isGround;
    this.drawCube();
  }

  onDirectoryChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sceneDir = input.value;
  }

  onJSONCameraParamsFileUpload(jsonPath: string) {
    fetch(`${jsonPath}/cam_params.json`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load camera parameters: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        this.camera_intrinsic = data["K"];
      })
      .catch(error => {
        console.error('Error loading camera parameters:', error);
      });
  }

  onImageUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.uploadedImage = img;
        
        // Display the image on the canvas without cubes first
        const canvas = this.canvasElement.nativeElement;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
        
        // If we already have cubes and camera params, we can draw the cubes
        if (this.cubeList && this.camera_intrinsic) {
          this.drawCube();
        }
      };
      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  }
  onImageload(imagePath: string) {
    fetch(`${imagePath}/input.png`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
        }
        return response.blob();
      })
      .then(blob => {
        const img = new Image();
        const objectURL = URL.createObjectURL(blob);
        
        img.onload = () => {
          this.uploadedImage = img;
          
          // Display the image on the canvas without cubes first
          const canvas = this.canvasElement.nativeElement;
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }
          
          // If we already have cubes and camera params, we can draw the cubes
          if (this.cubeList && this.camera_intrinsic) {
            this.drawCube();
          }
          
          // Clean up the object URL to prevent memory leaks
          URL.revokeObjectURL(objectURL);
        };
        
        img.src = objectURL;
      })
      .catch(error => {
        console.error('Error loading the image:', error);
      });
  }
}