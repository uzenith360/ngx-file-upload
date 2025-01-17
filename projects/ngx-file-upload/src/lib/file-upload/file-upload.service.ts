import { HttpClient, HttpErrorResponse, HttpResponse, HttpUploadProgressEvent } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { HandledHttpResponse, HttpError, httpRetry } from '@uzenith360/http-utils';
import { Observable, catchError, throwError, concatMap, map, of } from 'rxjs';
import { EnvironmentConfig } from '../environment-config.interface';
import EnvironmentConfigService from '../environment-config.service';

interface UploadURLResult {
  signedURL: string;
  key: string;
}

@Injectable({
  providedIn: 'root',
})

export class FileUploadService {

  constructor(
    @Inject(EnvironmentConfigService) private config: EnvironmentConfig,
    private http: HttpClient,
  ) { }

  public uploadFile(file: File, prefix?: string, skipInterceptors?: boolean): Observable<HttpResponse<void> | HttpUploadProgressEvent> {
    // [
    //   'jpg', 'jpeg', 'png', 'gif', 
    //   'webp', 'apng', 'tif', 'tiff', 
    //   'pdf', 'svg', 'svgz', 'bmp', 
    //   'dib', 'xbm', 'ico', 'heif', 
    //   'heifs', 'heics', 'avci', 'avcs', 
    //   'avif', 'hiff'
    // ]

    return this.getUploadURL(
      file.type,
      file?.name?.split('.')?.slice(-1)?.[0]?.toLowerCase() || 'jpg',
      prefix,
      skipInterceptors,
    ).pipe(
      concatMap(
        ({ data: uploadURLResult }) =>
          this.uploadFileToURL(uploadURLResult?.signedURL!, file),
      ),
    );
  }

  private getUploadURL(mimeType: string, extension: string, prefix?: string, skipInterceptors?: boolean)
    : Observable<HandledHttpResponse<UploadURLResult>> {
    const params: { [key: string]: string | number } = {
      prefix: prefix!,
      mimeType,
      extension,
      // stop angular service worker from intercepting this request
      'ngsw-bypass': '',
      // random param to prevent the mobile browser for caching request
      s: `${Date.now()}${Math.floor(Math.random() * 1000)}`
    };

    return this.http.get(this.config.getUploadLinkURL, { params, headers: !!skipInterceptors ? { 'skip-interceptors': "true" } : {} })
      .pipe(
        httpRetry(),
        catchError((err: HttpErrorResponse, caught: Observable<{ data: UploadURLResult, statusCode: number, message: any; }>) => {
          return of(
            {
              statusCode: err?.status,
              message: err?.error?.message ?? 'Problem completing this request, please try again',
              data: {} as UploadURLResult,
            },
          )
        }),
        map<{ data: UploadURLResult, statusCode: number, message: any }, HandledHttpResponse<UploadURLResult>>(
          ({ data: uploadURLResult, statusCode, message }) => (
            {
              data: uploadURLResult,
              message,
              statusCode: statusCode ?? 200,
            }
          ),
        ),
      );
  }

  private uploadFileToURL(uploadFileURL: string, file: File): Observable<HttpResponse<void> | HttpUploadProgressEvent> {
    if (!uploadFileURL) {
      return throwError(() => new HttpError('Upload URL is invalid', 0));
    }

    const pathname: string = (new URL(uploadFileURL)).pathname;

    return this.http.put(
      uploadFileURL,
      file,
      {
        headers: {
          // stop HTTPInterceptors from catching it and adding headers
          'skip-interceptors': "true",
          // stop angular service worker from intercepting this request
          // wierdly, this issue only showed up on mobile
          'ngsw-bypass': "true",
          // This Content-Disposition is to force the browser to download file 
          // rather than preview it when the download button is clicked
          'Content-Disposition': `attachment; filename=${file.name ?? pathname.substring(pathname.lastIndexOf('/') + 1)}`,
        },
        observe: 'events',
        reportProgress: !this.config.ignoreProgressReports,
      }
    ).pipe(
      httpRetry(),
      catchError((err: HttpErrorResponse, caught: Observable<HttpResponse<void> | HttpUploadProgressEvent>) => {
        switch (err?.status) {
          case 500:
            return throwError(() => new HttpError('Problem uploading file, please try again', err?.status));
          case 0:
          default:
            return throwError(
              () => new HttpError(
                (err?.error?.message?.join && err?.error?.message?.join(', ')) ?? err?.error?.message ?? err?.message ?? 'Problem uploading file, please check network and try again',
                err?.status,
              ),
            );
        };
      }),
    );
  }
}
