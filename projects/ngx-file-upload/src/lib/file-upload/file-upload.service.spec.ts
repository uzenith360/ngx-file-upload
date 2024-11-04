import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import EnvironmentConfigService from '../environment-config.service';

import { FileUploadService } from './file-upload.service';

describe('FileUploadService', () => {
  let service: FileUploadService;

  beforeEach(() => {
    TestBed.configureTestingModule(
      {
    imports: [],
    providers: [
        { provide: EnvironmentConfigService, useValue: {} },
        provideHttpClient(withInterceptorsFromDi())
    ]
},
    );
    service = TestBed.inject(FileUploadService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
