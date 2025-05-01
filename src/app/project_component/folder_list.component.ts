// folder-explorer.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
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
  is_deleted?: boolean;
  refinedBoxPath?: string;
}

interface PaginationInfo {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
}

interface DirectoryStats {
  totalFolders: number;
  refinedFolders: number;
  deletedFolders: number;
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
  
  // Add directory stats
  directoryStats: DirectoryStats = {
    totalFolders: 0,
    refinedFolders: 0,
    deletedFolders: 0
  };
  
  pagination: PaginationInfo = {
    currentPage: 1,
    itemsPerPage: 400,
    totalItems: 0,
    totalPages: 0
  };

  constructor(
    private router: Router, 
    private http: HttpClient,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Load directory statistics
    this.loadDirectoryStats();
    
    // Get page from route query parameters
    this.route.queryParams.subscribe(params => {
      const page = params['page'] ? parseInt(params['page'], 10) : 1;
      this.pagination.currentPage = page;
      this.loadAssetsStructure();
    });
  }

  loadDirectoryStats(): void {
    this.http.get<{
      success: boolean,
      stats: DirectoryStats
    }>(`${this.apiBaseUrl}/api/directory-stats`).subscribe({
      next: (response) => {
        if (response.success) {
          this.directoryStats = response.stats;
        } else {
          console.error('Error loading directory stats:', response);
        }
      },
      error: (error) => {
        console.error('Failed to load directory statistics:', error);
      }
    });
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
            // Override the currentPage from the response with our route parameter
            // to ensure consistency
            this.pagination.currentPage = this.pagination.currentPage;
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
    
    // Get all parent directories for pagination
    const parentDirectories = this.folderStructure.filter(item => item.isFolder);
    
    // Sort parent directories alphabetically
    parentDirectories.sort((a, b) => a.name.localeCompare(b.name));
    
    // Apply pagination to parent directories
    this.applyPagination(parentDirectories);
    
    // Flatten the structure for display, starting with paginated parent directories
    const flatten = (items: FolderItem[]) => {
      items.forEach(item => {
        this.flattenedFolderStructure.push(item);
        
        if (item.isFolder && item.children && item.isExpanded) {
          flatten(item.children);
        }
      });
    };
    
    flatten(this.paginatedItems);
  }
  
  applyPagination(parentDirectories: FolderItem[]): void {
    const startIndex = (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
    const endIndex = startIndex + this.pagination.itemsPerPage;
    this.paginatedItems = parentDirectories.slice(startIndex, endIndex);
  }

  toggleFolder(folder: FolderItem): void {
    folder.isExpanded = !folder.isExpanded;
    this.flattenFolderStructure();
  }

  refreshDirectory(): void {
    this.loadDirectoryStats();
    this.loadAssetsStructure();
  }
  
  changePage(page: number): void {
    if (page < 1 || page > this.pagination.totalPages) {
      return;
    }
    
    // Update the route query parameter
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page },
      queryParamsHandling: 'merge'
    });
    
    // The page will be reloaded via the route subscription in ngOnInit
  }
  
  nextPage(): void {
    this.changePage(this.pagination.currentPage + 1);
  }
  
  prevPage(): void {
    this.changePage(this.pagination.currentPage - 1);
  }
}