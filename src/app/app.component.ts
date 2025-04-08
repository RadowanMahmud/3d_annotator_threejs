import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WithoutEditPlyViewerComponent } from './viewer/boundingboxannotator.component';
import { PlyViewerComponent } from './viewer/UploadPly.component';
import { PlyViewer2Component } from './viewer_2/UploadPly_2.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, WithoutEditPlyViewerComponent, PlyViewerComponent, PlyViewer2Component],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'annotations_editor';
}
