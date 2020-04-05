/**
 * ユーティリティサービス
 */
import * as azureStorage from 'azure-storage';
import * as createDebug from 'debug';
import { Stream } from 'stream';

const debug = createDebug('cinerino-domain:service');

const CONTAINER = 'files-from-cinerino-domain-util-service';

/**
 * ファイルをアップロードする
 */
export function uploadFile(params: {
    fileName: string;
    text: string | Buffer;
    expiryDate?: Date;
}) {
    return async () => {
        return new Promise<string>((resolve, reject) => {
            // save to blob
            const blobService = azureStorage.createBlobService();
            blobService.createContainerIfNotExists(
                CONTAINER,
                {
                    // publicAccessLevel: 'blob'
                },
                (createContainerError) => {
                    if (createContainerError instanceof Error) {
                        reject(createContainerError);

                        return;
                    }

                    blobService.createBlockBlobFromText(
                        CONTAINER, params.fileName, params.text, (createBlockBlobError, result, response) => {
                            debug(createBlockBlobError, result, response);
                            if (createBlockBlobError instanceof Error) {
                                reject(createBlockBlobError);

                                return;
                            }

                            try {
                                const url = publishBlob(params);

                                resolve(url);
                            } catch (error) {
                                reject(error);
                            }
                        }
                    );
                }
            );
        });
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
        return new Promise<string>((resolve, reject) => {
            // save to blob
            const blobService = azureStorage.createBlobService();
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

                    const writeStream = blobService.createWriteStreamToBlockBlob(CONTAINER, params.fileName)
                        .on('pipe', () => {
                            debug('Something is piping into the writer.');
                        });

                    await new Promise((resolveWriteStream, rejectWriteStream) => {
                        params.text.pipe(writeStream)
                            .on('error', async (err) => {
                                rejectWriteStream(err);
                            })
                            .on('finish', async () => {
                                resolveWriteStream();
                            });
                    });

                    try {
                        const url = publishBlob(params);

                        resolve(url);
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
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
