import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlyViewer2Component } from './viewer_2/UploadPly_2.component';
import { FolderExplorerComponent } from './project_component/folder_list.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PlyViewer2Component, FolderExplorerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'annotations_editor';
}
