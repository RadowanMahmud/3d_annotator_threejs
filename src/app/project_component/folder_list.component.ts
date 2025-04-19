// folder-explorer.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
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
  templateUrl: './folder_list.component.html',
  styleUrl: './folder_list.component.css'
})

export class FolderExplorerComponent implements OnInit {
  folderStructure: FolderItem[] = [];
  flattenedFolderStructure: FolderItem[] = [];
  selectedFolderPath: string | null = null;

  constructor(private router: Router, private http: HttpClient) {}



  openDashboard(item: any) {
    alert("hitting herre")
    const encodedPath = encodeURIComponent(item.path);
    alert(encodedPath)
    this.router.navigate(['/dashboard', encodedPath]);
  }

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
  ngOnInit(): void {
    // this.loadAssetsStructure();
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
}