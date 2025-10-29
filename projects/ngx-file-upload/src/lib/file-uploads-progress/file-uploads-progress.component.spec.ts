import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FileUploadsProgressComponent } from './file-uploads-progress.component';

describe('FileUploadsProgressComponent', () => {
  let component: FileUploadsProgressComponent;
  let fixture: ComponentFixture<FileUploadsProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUploadsProgressComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FileUploadsProgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
