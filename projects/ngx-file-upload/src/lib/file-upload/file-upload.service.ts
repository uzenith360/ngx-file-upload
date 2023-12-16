import { HttpClient, HttpErrorResponse, HttpEventType, HttpResponse, HttpUploadProgressEvent } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import type { UploadURLResult } from '@uzenith360/aws-s3-generate-upload-url';
import { HandledHttpResponse, HttpError, httpRetry } from '@uzenith360/http-utils';
import { Observable, catchError, throwError, concatMap, map, of, TimeoutError, switchMap, timeout } from 'rxjs';
import { EnvironmentConfig } from '../environment-config.interface';
import EnvironmentConfigService from '../environment-config.service';
import { FileUploadTimeoutError } from './file-upload-timeout.error';

@Injectable({
  providedIn: 'root',
})

export class FileUploadService {

  constructor(
    @Inject(EnvironmentConfigService) private config: EnvironmentConfig,
    private http: HttpClient,
  ) { }

  public uploadFile(file: File, prefix?: string): Observable<HttpResponse<void> | HttpUploadProgressEvent> {
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
    ).pipe(
      concatMap(
        ({ data: uploadURLResult }) =>
          this.uploadFileToURL(uploadURLResult?.signedURL!, file),
      ),
    );
  }

  private getUploadURL(mimeType: string, extension: string, prefix?: string,)
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

    return this.http.get(this.config.getUploadLinkURL, { params })
      .pipe(
        httpRetry(),
        catchError((err: HttpErrorResponse, caught: Observable<{ data: UploadURLResult, statusCode: number, message: any; }>) => {
          return of(
            {
              statusCode: err.status,
              message: err.error.message ?? 'Problem completing this request, please try again',
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
    const pathname: string = (new URL(uploadFileURL)).pathname;

    // Define the progress timeout duration in milliseconds.
    const progressTimeoutDuration: number = this.config.progressTimeoutDuration ?? 3 * 60 * 1000; // 3 minutes.

    // tracks last time a progress event was received
    let lastProgressTimestamp: number = Date.now();

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
        reportProgress: /*!this.config.ignoreProgressReports*/true,
      }
    ).pipe(
      httpRetry(),
      switchMap((event: HttpResponse<void> | HttpUploadProgressEvent) => {
        if (event.type === HttpEventType.UploadProgress) {
          lastProgressTimestamp = Date.now();
        }

        return new Observable<HttpResponse<void> | HttpUploadProgressEvent>(observer => {
          observer.next(event);

          return { unsubscribe() { } };
        }).pipe(
          // timeoutWith(
          //   progressTimeoutDuration,
          //   new Observable<HttpResponse<void> | HttpUploadProgressEvent>(observer => {
          //     const currentTime = Date.now();
          //     if (currentTime - lastProgressTimestamp > progressTimeoutDuration) {
          //       observer.error(new CustomTimeoutError());
          //     } else {
          //       observer.complete(); // Do not timeout since we have received progress events.
          //     }
          //   }
          //   )
          // ),
          // timeout(
          //   {
          //     each: progressTimeoutDuration,
          //     with: (info: TimeoutInfo<HttpResponse<void> | HttpUploadProgressEvent, unknown>) =>
          //       new Observable<HttpResponse<void> | HttpUploadProgressEvent>(observer => {
          //         const currentTime = Date.now();
          //         if (currentTime - lastProgressTimestamp > progressTimeoutDuration) {
          //           observer.error(new CustomTimeoutError());
          //         } else {
          //           observer.complete(); // Do not timeout since we have received progress events.
          //         }
          //       }
          //       )
          //   }
          // )
          timeout({
            each: progressTimeoutDuration,
            with: (/*info: TimeoutInfo<HttpResponse<void> | HttpUploadProgressEvent, unknown>*/) => {
              const currentTime: number = Date.now();

              if (currentTime - lastProgressTimestamp > progressTimeoutDuration) {
                return throwError(() => new FileUploadTimeoutError());
              } else {
                return new Observable<HttpResponse<void> | HttpUploadProgressEvent>(observer => observer.complete()); // Do not timeout since we have received progress events.
              }
            }
          }),
        );
      }),

      catchError((err: HttpErrorResponse, caught: Observable<HttpResponse<void> | HttpUploadProgressEvent>) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new FileUploadTimeoutError());
        } else {
          switch (err.status) {
            case 500:
              return throwError(() => new HttpError('Problem uploading file, please try again', err.status));
            case 0:
            default:
              return throwError(
                () => new HttpError(
                  (err.error?.message?.join && err.error?.message?.join(', ')) ?? err.error?.message ?? err?.message ?? 'Problem uploading file, please check network and try again',
                  err.status,
                ),
              );
          };
        }
      }),
    );
  }
}
