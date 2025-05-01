// folder-explorer.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface FolderItem {
  id: number;
  name: string;
  path: string;
  isFolder: boolean;
  children?: FolderItem[];
  isExpanded?: boolean;
  level: number;
  has3dBoxRefined?: boolean;
  refinedBoxPath?: string;
}

interface PaginationInfo {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
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
  paginatedItems: FolderItem[] = [];
  selectedFolderPath: string | null = 'assets';
  apiBaseUrl = 'http://cvlabhumanrefinement.cs.virginia.edu/api'; // Update with your actual API URL
  
  pagination: PaginationInfo = {
    currentPage: 1,
    itemsPerPage: 400,
    totalItems: 0,
    totalPages: 0
  };

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAssetsStructure();
  }

  loadAssetsStructure(): void {
    this.http.get<{
      success: boolean, 
      structure: FolderItem[], 
      pagination: PaginationInfo
    }>(`${this.apiBaseUrl}/api/directory?page=${this.pagination.currentPage}`)
      .subscribe({
        next: (response) => {
          if (response.success && response.structure) {
            this.folderStructure = response.structure;
            this.pagination = response.pagination;
            this.flattenFolderStructure();
            this.applyPagination();
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
    const encodedPath = encodeURIComponent(item.path);
    this.router.navigate(['/dashboard', encodedPath]);
  }
  
  openRefinedBox(item: FolderItem): void {
    if (item.refinedBoxPath) {
      const encodedPath = encodeURIComponent(item.refinedBoxPath);
      this.router.navigate(['/refined-box', encodedPath]);
    }
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
    this.applyPagination();
  }
  
  applyPagination(): void {
    const startIndex = (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
    const endIndex = startIndex + this.pagination.itemsPerPage;
    this.paginatedItems = this.flattenedFolderStructure.slice(startIndex, endIndex);
  }

  toggleFolder(folder: FolderItem): void {
    folder.isExpanded = !folder.isExpanded;
    this.flattenFolderStructure();
  }

  refreshDirectory(): void {
    this.loadAssetsStructure();
  }
  
  changePage(page: number): void {
    if (page < 1 || page > this.pagination.totalPages) {
      return;
    }
    
    this.pagination.currentPage = page;
    this.applyPagination();
  }
  
  nextPage(): void {
    this.changePage(this.pagination.currentPage + 1);
  }
  
  prevPage(): void {
    this.changePage(this.pagination.currentPage - 1);
  }
}