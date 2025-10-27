export class BatchUploadFiles<T extends { _id: string, name: string }, R extends { id: string }> {
    private failedCount: number = 0;
    private isDestroyed: boolean = false;
    private uploadResults: R[] = [];
    private uploadQueue: T[] = [];
    private concurrentUploads: number = 0;
    private fileUploadsProgress: { name: string, progress: number }[] = [];
    private readonly maxUploadConcurrencyAndriod: number = 3;
    private readonly maxUploadConcurrencyIOS: number = 5;
    private readonly maxUploadConcurrencyOther: number = 7;
    private readonly maxUploadConcurrency: number;
    private readonly minUploadConcurrency: number = 1;
    private readonly startUploadConcurrency: number = 3;
    private readonly maxFailedLimit: number = 20;

    private uploadConcurrency: number = this.startUploadConcurrency;

    constructor(
        private readonly photos: T[],
        private readonly onUpload: (index: number) => void,
        private readonly onUploadProgress: (photoId: string, percent: number) => void,
        private readonly onFileUploadsProgressCb: (fileUploadsProgress: { name: string, progress: number }[]) => void,
        private readonly onFailure: (error: unknown, result: R[], failed?: T[]) => void,
        private readonly onSuccess: (result: R[]) => void,
        private readonly uploadPhotoTask: (photo: T, progressCb: (name: string, progress: number) => void) => Promise<R>,
        private readonly deviceType: 'ANDROID' | 'IOS' | 'OTHER', // Other includes laptop so high powered
    ) {
        this.uploadQueue = [...photos];
        this.maxUploadConcurrency = {
            'ANDROID': this.maxUploadConcurrencyAndriod,
            'IOS': this.maxUploadConcurrencyIOS,
            'OTHER': this.maxUploadConcurrencyOther,
        }[deviceType];

        this.fillUploadersConcurrently();
    }


    private fillUploadersConcurrently(): void {
        // check if there's photos on the uploadQueue and space on the concurrent queue
        if (this.concurrentUploads < this.uploadConcurrency && !!this.uploadQueue.length) {
            do {
                // if there's space, fill the concurrent uploads, shift()...ing from uploadQueue 
                const photo: T | undefined = this.uploadQueue.shift();

                if (!!photo) {
                    // and incrementing concurrentUploads, with each shifted photo then call processQueue
                    this.concurrentUploads += 1;

                    this.uploaderRun(photo);
                } else {
                    break;
                }
            } while (this.concurrentUploads < this.uploadConcurrency)
        } else {
            // if no space, DO NOTHING
            // console.warn('QUEUE FULL')
        }
    }

    private uploaderRun(photo: T): void {
        let fileUploadsProgressRef: { name: string; progress: number; } | null
            = { name: photo.name, progress: 0 };

        this.fileUploadsProgress.push(fileUploadsProgressRef);

        this.onFileUploadsProgressCb(this.fileUploadsProgress);

        // call upload task
        this.uploadPhotoTask(
            photo,
            (name, progress) => {
                if (!!fileUploadsProgressRef) {
                    fileUploadsProgressRef.progress = progress;

                    this.onFileUploadsProgressCb(this.fileUploadsProgress);
                }
            },
        ).then(
            (successPhoto: R) => {
                const uploadResultsLength: number = this.uploadResults.length + 1;

                // progress event handlers
                this.onUpload(uploadResultsLength);
                this.onUploadProgress(successPhoto.id, uploadResultsLength);

                // call onAfterUploaderRun with result
                this.onAfterUploaderRun(successPhoto);
            }
        ).catch( // call onAfterUploaderRun with result
            (e: Error) => this.onAfterUploaderRun(undefined, photo, e),
        ).finally(
            () => {
                const photoIndex: number
                    = this.fileUploadsProgress.findIndex(
                        ({ name }) => name === photo.name,
                    );

                if (photoIndex !== -1) {
                    this.fileUploadsProgress.splice(photoIndex, 1);

                    this.onFileUploadsProgressCb(this.fileUploadsProgress);
                }

                fileUploadsProgressRef = null;
            }
        );

    }

    private onAfterUploaderRun(
        successPhoto: R | undefined,
        failedPhoto?: T,
        error?: unknown
    ): void {
        if (this.isDestroyed) {
            return;
        }

        // decrement concurrentUploads
        this.concurrentUploads -= 1;

        if (!!failedPhoto) {
            // if error increment failedCount, check if its reached maxFailedLimit 
            this.failedCount += 1;

            //unshift() failedPhoto back to the uploadQueue
            this.uploadQueue.unshift(failedPhoto);

            if (this.failedCount >= this.maxFailedLimit) {
                // if its reached, call failedHandler with results at the point and remaining photos
                const uploadedIds: string[] = this.uploadResults.map(({ id }) => id);

                this.onFailure(
                    error,
                    this.uploadResults,
                    this.photos.filter(({ _id }) => !uploadedIds.includes(_id)),
                );

                //call destroy 
                this.destroy();

                //and return
                return;
            } else {
                // if its not reached call decreaseUploadConcurrency
                this.decreaseUploadConcurrency();
            }
        } else if (!!successPhoto) {
            // if no error, reset failedCount to 0, push successPhoto to uploadResults

            this.failedCount && (this.failedCount = 0);

            this.uploadResults.push(successPhoto);

            const photosLength: number = this.photos.length;
            const uploadQueueLength: number = this.uploadQueue.length;
            const uploadResultsLength: number = this.uploadResults.length;


            // if upload queue empty and photosLength more than or equal to photosLength
            if (uploadQueueLength === 0 && uploadResultsLength >= photosLength) {
                // call success handler
                this.onSuccess(this.uploadResults);

                // call destroy
                this.destroy();

                // and return 
                return;
            } else {
                this.increaseUploadConcurrency();
            }
        } else {
            console.error('Wierd situation, neither failedPhotos nor successPhotos are set')
        }

        // call fillUploadersConcurrently
        this.fillUploadersConcurrently();
    }

    destroy(): void {
        this.isDestroyed = true;

        this.uploadResults = [];
        this.uploadQueue = [];
    }

    private increaseUploadConcurrency(): void {
        this.uploadConcurrency < this.maxUploadConcurrency && (this.uploadConcurrency += 1);
    }

    private decreaseUploadConcurrency(): void {
        this.uploadConcurrency > this.minUploadConcurrency && (this.uploadConcurrency -= 1);
    }
}