/**
 * ユーティリティサービス
 */
import * as azureStorage from 'azure-storage';
import * as createDebug from 'debug';
import { Stream } from 'stream';

const debug = createDebug('cinerino-domain:service');

const CONTAINER = 'files-from-cinerino-domain-util-service';

function createContainerIfNotExists() {
    return async () => {
        const blobService = azureStorage.createBlobService();

        // コンテナ作成
        await new Promise((resolve, reject) => {
            blobService.createContainerIfNotExists(
                CONTAINER,
                {
                    // publicAccessLevel: 'blob'
                },
                async (createContainerError) => {
                    if (createContainerError instanceof Error) {
                        reject(createContainerError);

                        return;
                    }

                    resolve();
                }
            );
        });
    };
}

/**
 * ファイルをアップロードする
 */
export function uploadFile(params: {
    fileName: string;
    text: string | Buffer;
    expiryDate?: Date;
}) {
    return async () => {
        // コンテナ作成
        await createContainerIfNotExists()();

        // ブロブ作成
        await new Promise<string>((resolve, reject) => {
            // save to blob
            const blobService = azureStorage.createBlobService();

            blobService.createBlockBlobFromText(
                CONTAINER, params.fileName, params.text, (createBlockBlobError, result, response) => {
                    debug(createBlockBlobError, result, response);
                    if (createBlockBlobError instanceof Error) {
                        reject(createBlockBlobError);

                        return;
                    }

                    resolve();
                }
            );
        });

        return publishBlob(params);
    };
}

/**
 * ファイルをアップロードする
 */
export function uploadFileFromStream(params: {
    fileName: string;
    text: Stream;
    expiryDate?: Date;
}) {
    return async () => {
        // コンテナ作成
        await createContainerIfNotExists()();

        // ブロブ作成
        await new Promise(async (resolve, reject) => {
            const blobService = azureStorage.createBlobService();

            const writeStream = blobService.createWriteStreamToBlockBlob(CONTAINER, params.fileName)
                .on('pipe', () => {
                    // tslint:disable-next-line:no-console
                    console.log('uploadFileFromStream: something is piping into the writer.');
                });

            let finished = false;

            params.text
                .on('error', (err) => {
                    // tslint:disable-next-line:no-console
                    console.error('uploadFileFromStream: readStream.on(error): ', err);
                    reject(err);
                })
                .pipe(writeStream)
                .on('drain', () => {
                    // tslint:disable-next-line:no-console
                    console.log('uploadFileFromStream: writeStream.on(drain)');
                })
                .on('error', (err) => {
                    // tslint:disable-next-line:no-console
                    console.error('uploadFileFromStream: writeStream.on(error): ', err);
                    reject(err);
                })
                .on('finish', () => {
                    // tslint:disable-next-line:no-console
                    console.log('uploadFileFromStream: writeStream.on(finish)');
                    finished = true;
                    resolve();
                })
                .on('close', () => {
                    // tslint:disable-next-line:no-console
                    console.log('uploadFileFromStream: writeStream.on(close)', 'finished:', finished);
                });
        });

        return publishBlob(params);
    };
}

function publishBlob(params: {
    fileName: string;
    expiryDate?: Date;
}) {
    const blobService = azureStorage.createBlobService();

    // 期限つきのURLを発行する
    const startDate = new Date();
    const expiryDate = (params.expiryDate instanceof Date) ? params.expiryDate : new Date(startDate);
    // tslint:disable-next-line:no-magic-numbers
    expiryDate.setMinutes(startDate.getMinutes() + 10);
    // tslint:disable-next-line:no-magic-numbers
    startDate.setMinutes(startDate.getMinutes() - 10);
    const sharedAccessPolicy = {
        AccessPolicy: {
            Permissions: azureStorage.BlobUtilities.SharedAccessPermissions.READ,
            Start: startDate,
            Expiry: expiryDate
        }
    };
    const token = blobService.generateSharedAccessSignature(CONTAINER, params.fileName, sharedAccessPolicy);

    return blobService.getUrl(CONTAINER, params.fileName, token);
}
