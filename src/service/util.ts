/**
 * ユーティリティサービス
 */
import * as azureStorage from 'azure-storage';
import * as createDebug from 'debug';

const debug = createDebug('cinerino-domain:service');

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
            const CONTAINER = 'files-from-cinerino-domain-util-service';
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
                                const token = blobService.generateSharedAccessSignature(
                                    result.container, result.name, sharedAccessPolicy
                                );

                                const url = blobService.getUrl(result.container, result.name, token);

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
