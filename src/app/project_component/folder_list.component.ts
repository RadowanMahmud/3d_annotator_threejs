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
  has3dBoxRefined?: boolean;
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
  selectedFolderPath: string | null = 'assets';
  apiBaseUrl = 'http://localhost:3000'; // Update with your actual API URL

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAssetsStructure();
  }

  loadAssetsStructure(): void {
    this.http.get<{success: boolean, structure: FolderItem[]}>(`${this.apiBaseUrl}/api/directory`)
      .subscribe({
        next: (response) => {
          if (response.success && response.structure) {
            this.folderStructure = response.structure;
            this.flattenFolderStructure();
          } else {
            console.error('Error loading directory structure:', response);
          }
        },
        error: (error) => {
          console.error('Failed to load directory structure:', error);
        }
      });
  }

  openDashboard(item: FolderItem): void {
    alert(item.path)
    const encodedPath = encodeURIComponent(item.path);
    this.router.navigate(['/dashboard', encodedPath]);
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

  refreshDirectory(): void {
    this.loadAssetsStructure();
  }
}