import { Component, input, output } from '@angular/core';

@Component({
  selector: 'ngx-file-uploads-progress',
  templateUrl: './file-uploads-progress.component.html',
  styleUrl: './file-uploads-progress.component.css'
})
export class FileUploadsProgressComponent {
  readonly resumeUploadFilesEvent = output<void>();
  readonly isPhotoUploadsBusy = input<boolean>(false);

  public totalUploads = input<number | undefined>();
  public uploadProgress = input<number | undefined>();
  public currentUploadIndex = input<number | undefined>();
  public filesUploadProgress = input<{ name: string, progress: number }[] | undefined>();
  public isUploadsResumeData = input<boolean>();
}
