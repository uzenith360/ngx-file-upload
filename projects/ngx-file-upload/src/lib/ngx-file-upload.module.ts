import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ModuleWithProviders, NgModule } from '@angular/core';
import { FileUploadService } from '../public-api';
import { EnvironmentConfig } from './environment-config.interface';
import EnvironmentConfigService from './environment-config.service';

@NgModule({
  declarations: [],
  imports: [
    HttpClientModule,
    CommonModule,
  ],
  exports: []
})
export class NgxFileUploadModule {
  static forRoot(config: EnvironmentConfig): ModuleWithProviders<NgxFileUploadModule> {
    return {
      ngModule: NgxFileUploadModule,
      providers: [
        FileUploadService,
        {
          provide: EnvironmentConfigService,
          useValue: config,
        }
      ],
    }
  }
 }
