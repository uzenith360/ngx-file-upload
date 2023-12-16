export class FileUploadTimeoutError extends Error {
    constructor() {
        super('File Upload Timeout has occurred');
    }
}
