// folder-explorer.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FolderItem {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FolderItem[];
  isExpanded?: boolean;
  level: number;
}

@Component({
  selector: 'app-folder-explorer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="folder-explorer-container">
      <h2>Folder Explorer</h2>
      
      <div class="folder-selector">
        <input
          type="file"
          #folderInput
          webkitdirectory
          directory
          (change)="onFolderSelected($event)"
          style="display: none">
        <button (click)="folderInput.click()" class="select-button">
          Select Folder
        </button>
        <span *ngIf="selectedFolderPath" class="selected-path">
          Selected: {{ selectedFolderPath }}
        </span>
      </div>
      
      <div *ngIf="folderStructure.length > 0" class="folder-table-container">
        <table class="folder-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Path</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <ng-container *ngFor="let item of flattenedFolderStructure">
              <tr [style.padding-left.px]="item.level * 20">
                <td>
                  <span class="indent" [style.width.px]="item.level * 20"></span>
                  <span class="folder-icon" *ngIf="item.isFolder">📁</span>
                  <span class="file-icon" *ngIf="!item.isFolder">📄</span>
                  {{ item.name }}
                </td>
                <td>{{ item.path }}</td>
                <td>{{ item.isFolder ? 'Folder' : 'File' }}</td>
                <td>
                  <!-- Toggle button for folders with children -->
                  <button *ngIf="item.isFolder && item.children?.length" 
                          (click)="toggleFolder(item)"
                          class="toggle-button">
                    {{ item.isExpanded ? 'Collapse' : 'Expand' }}
                  </button>
                  
                  <!-- Open Dashboard button only for first-level folders (level = 1) -->
                  <button *ngIf="item.isFolder && item.level === 1" 
                          (click)="openDashboard(item)"
                          class="dashboard-button">
                    Open Dashboard
                  </button>
                </td>
              </tr>
            </ng-container>
          </tbody>
        </table>
      </div>
      
      <div *ngIf="folderStructure.length === 0 && selectedFolderPath" class="empty-state">
        No folders found in the selected directory.
      </div>
    </div>
  `,
  styles: [`
    .folder-explorer-container {
      font-family: Arial, sans-serif;
      padding: 20px;
      max-width: 900px;
      margin: 0 auto;
    }
    
    .folder-selector {
      margin-bottom: 20px;
    }
    
    .select-button {
      padding: 8px 16px;
      background-color: #4285f4;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .selected-path {
      margin-left: 15px;
      color: #555;
      font-style: italic;
    }
    
    .folder-table-container {
      margin-top: 20px;
      overflow-x: auto;
    }
    
    .folder-table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
    }
    
    .folder-table th, .folder-table td {
      text-align: left;
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
    
    .folder-table th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    
    .folder-icon, .file-icon {
      margin-right: 5px;
    }
    
    .indent {
      display: inline-block;
    }
    
    .toggle-button {
      padding: 4px 8px;
      background-color: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 3px;
      cursor: pointer;
      margin-right: 5px;
    }
    
    .toggle-button:hover {
      background-color: #e0e0e0;
    }
    
    .dashboard-button {
      padding: 4px 8px;
      background-color: #34a853;
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }
    
    .dashboard-button:hover {
      background-color: #2d9249;
    }
    
    .empty-state {
      padding: 20px;
      text-align: center;
      color: #888;
      background-color: #f9f9f9;
      border-radius: 4px;
    }
  `]
})
export class FolderExplorerComponent implements OnInit {
  folderStructure: FolderItem[] = [];
  flattenedFolderStructure: FolderItem[] = [];
  selectedFolderPath: string | null = null;

  ngOnInit(): void {}

  onFolderSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    
    if (!files || files.length === 0) {
      return;
    }

    // Extract the base folder path from the first file
    const firstFilePath = files[0].webkitRelativePath;
    this.selectedFolderPath = firstFilePath.split('/')[0];
    
    // Build folder structure
    this.buildFolderStructure(files);
    this.flattenFolderStructure();
  }

  buildFolderStructure(files: FileList): void {
    const root: FolderItem[] = [];
    const folderMap = new Map<string, FolderItem>();
    
    // Create root folder
    const rootFolderName = this.selectedFolderPath as string;
    const rootFolder: FolderItem = {
      name: rootFolderName,
      path: rootFolderName,
      isFolder: true,
      children: [],
      isExpanded: true,
      level: 0
    };
    
    root.push(rootFolder);
    folderMap.set(rootFolderName, rootFolder);

    // Process all files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pathParts = file.webkitRelativePath.split('/');
      
      // Skip the first part which is the selected folder name (already added)
      let currentPath = pathParts[0];
      let parentFolder = folderMap.get(currentPath) as FolderItem;
      
      // Process each path part
      for (let j = 1; j < pathParts.length; j++) {
        const part = pathParts[j];
        currentPath += '/' + part;
        
        // Check if this path already exists in our map
        if (!folderMap.has(currentPath)) {
          const isFolder = j < pathParts.length - 1;
          const newItem: FolderItem = {
            name: part,
            path: currentPath,
            isFolder: isFolder,
            level: j,
            isExpanded: false
          };
          
          if (isFolder) {
            newItem.children = [];
          }
          
          // Add to parent's children
          if (!parentFolder.children) {
            parentFolder.children = [];
          }
          parentFolder.children.push(newItem);
          
          // Add to map for future reference
          folderMap.set(currentPath, newItem);
        }
        
        // Update parent for next iteration
        if (j < pathParts.length - 1) {
          parentFolder = folderMap.get(currentPath) as FolderItem;
        }
      }
    }
    
    this.folderStructure = root;
  }

  flattenFolderStructure(): void {
    this.flattenedFolderStructure = [];
    
    const flatten = (items: FolderItem[]) => {
      items.forEach(item => {
        this.flattenedFolderStructure.push(item);
        
        if (item.isFolder && item.children && item.isExpanded) {
          flatten(item.children);
        }
      });
    };
    
    flatten(this.folderStructure);
  }

  toggleFolder(folder: FolderItem): void {
    folder.isExpanded = !folder.isExpanded;
    this.flattenFolderStructure();
  }

  openDashboard(folder: FolderItem): void {
    console.log(`Opening dashboard for folder: ${folder.name} at path: ${folder.path}`);
    // Here you would typically implement navigation to a dashboard view
    // or open a modal with dashboard content for the selected folder
    alert(`Dashboard opened for folder: ${folder.name}`);
    
    // Example of how you might navigate in a real application:
    // this.router.navigate(['/dashboard'], { 
    //   queryParams: { folderPath: folder.path, folderName: folder.name } 
    // });
  }
}