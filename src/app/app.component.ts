import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WithoutEditPlyViewerComponent } from './viewer/boundingboxannotator.component';
import { PlyViewerComponent } from './viewer/UploadPly.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, WithoutEditPlyViewerComponent, PlyViewerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'annotations_editor';
}
