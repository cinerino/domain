import * as AWS from 'aws-sdk';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

import { credentials } from '../credentials';

import * as factory from '../factory';

export type AttributeListType = AWS.CognitoIdentityServiceProvider.AttributeListType;
export type IPerson = factory.person.IPerson;

const awsCredentials = new AWS.Credentials({
    accessKeyId: credentials.aws.accessKeyId,
    secretAccessKey: credentials.aws.secretAccessKey
});

const TOKEN_ISSUER_ENDPOINT = 'https://cognito-idp.ap-northeast-1.amazonaws.com';

/**
 * 会員リポジトリ
 */
export class CognitoRepository {
    public readonly userPoolId: string;
    public readonly cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;

    constructor(params: {
        userPoolId: string;
    }) {
        this.userPoolId = params.userPoolId;
        this.cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider({
            apiVersion: 'latest',
            region: 'ap-northeast-1',
            credentials: awsCredentials
        });
    }

    public static ATTRIBUTE2PROFILE(userAttributes: AttributeListType) {
        const additionalProperty: factory.person.IAdditionalProperty = userAttributes.map((a) => {
            return { name: a.Name, value: a.Value };
        });

        const profile: factory.person.IProfile = {
            givenName: '',
            familyName: '',
            email: '',
            telephone: '',
            additionalProperty: additionalProperty
        };

        userAttributes.forEach((userAttribute) => {
            switch (userAttribute.Name) {
                case 'given_name':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.givenName = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'family_name':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.familyName = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'email':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.email = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'phone_number':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    profile.telephone = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
            }
        });

        return profile;
    }

    public static ATTRIBUTE2PERSON(params: {
        username?: string;
        userPoolId?: string;
        attributes: AttributeListType;
    }) {
        const profile = CognitoRepository.ATTRIBUTE2PROFILE(params.attributes);

        const identifier: factory.person.IIdentifier = [];
        if (typeof params.userPoolId === 'string') {
            identifier.push(
                { name: 'tokenIssuer', value: `${TOKEN_ISSUER_ENDPOINT}/${params.userPoolId}` },
                { name: 'iss', value: `${TOKEN_ISSUER_ENDPOINT}/${params.userPoolId}` }
            );
        }

        const person: IPerson = {
            ...profile,
            typeOf: factory.personType.Person,
            id: '',
            identifier: identifier,
            memberOf: {
                typeOf: 'ProgramMembership',
                membershipNumber: params.username,
                programName: 'Amazon Cognito',
                award: []
            }
        };

        params.attributes.forEach((a) => {
            switch (a.Name) {
                case 'sub':
                    // tslint:no-single-line-block-comment
                    person.id = (a.Value !== undefined) ? a.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
            }
        });

        return person;
    }

    public static PROFILE2ATTRIBUTE(params: factory.person.IProfile): AttributeListType {
        let formatedPhoneNumber: string;
        try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            const phoneNumber = phoneUtil.parse(params.telephone);
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore if */
            if (!phoneUtil.isValidNumber(phoneNumber)) {
                throw new Error('Invalid phone number');
            }
            formatedPhoneNumber = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
        } catch (error) {
            throw new factory.errors.Argument('telephone', 'Invalid phone number');
        }

        const userAttributes: AttributeListType = [
            {
                Name: 'given_name',
                Value: params.givenName
            },
            {
                Name: 'family_name',
                Value: params.familyName
            },
            {
                Name: 'phone_number',
                Value: formatedPhoneNumber
            },
            {
                Name: 'email',
                Value: params.email
            }
        ];
        if (Array.isArray(params.additionalProperty)) {
            userAttributes.push(...params.additionalProperty.map((a) => {
                return {
                    Name: a.name,
                    Value: a.value
                };
            }));
        }

        return userAttributes;
    }

    /**
     * 管理者権限でユーザー属性を取得する
     */
    public async  getUserAttributes(params: {
        username: string;
    }) {
        return new Promise<factory.person.IProfile>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.adminGetUser(
                {
                    UserPoolId: this.userPoolId,
                    Username: params.username
                },
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore if: please write tests */
                        if (data.UserAttributes === undefined) {
                            reject(new factory.errors.NotFound('User'));
                        } else {
                            resolve(CognitoRepository.ATTRIBUTE2PROFILE(data.UserAttributes));
                        }
                    }
                });
        });
    }

    /**
     * 管理者権限でプロフィール更新
     */
    public async updateProfile(params: {
        username: string;
        profile: factory.person.IProfile;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const userAttributes = CognitoRepository.PROFILE2ATTRIBUTE(params.profile);

            this.cognitoIdentityServiceProvider.adminUpdateUserAttributes(
                {
                    UserPoolId: this.userPoolId,
                    Username: params.username,
                    UserAttributes: userAttributes
                },
                (err) => {
                    if (err instanceof Error) {
                        reject(new factory.errors.Argument('profile', err.message));
                    } else {
                        resolve();
                    }
                });
        });
    }

    /**
     * 管理者権限でsubでユーザーを検索する
     */
    public async findById(params: {
        userId: string;
    }) {
        return new Promise<IPerson>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.listUsers(
                {
                    UserPoolId: this.userPoolId,
                    Filter: `sub="${params.userId}"`
                },
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore if: please write tests */
                        if (data.Users === undefined) {
                            reject(new factory.errors.NotFound('User'));
                        } else {
                            const user = data.Users.shift();
                            if (user === undefined || user.Attributes === undefined) {
                                reject(new factory.errors.NotFound('User'));
                            } else {
                                resolve(CognitoRepository.ATTRIBUTE2PERSON({
                                    username: user.Username,
                                    userPoolId: this.userPoolId,
                                    attributes: user.Attributes
                                }));
                            }
                        }
                    }
                });
        });
    }

    /**
     * アクセストークンでユーザー属性を取得する
     */
    public async getUserAttributesByAccessToken(accessToken: string): Promise<factory.person.IProfile> {
        return new Promise<factory.person.IProfile>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.getUser(
                {
                    AccessToken: accessToken
                },
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve(CognitoRepository.ATTRIBUTE2PROFILE(data.UserAttributes));
                    }
                });
        });
    }

    /**
     * 会員プロフィール更新
     */
    public async updateProfileByAccessToken(params: {
        accessToken: string;
        profile: factory.person.IProfile;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const userAttributes = CognitoRepository.PROFILE2ATTRIBUTE(params.profile);

            this.cognitoIdentityServiceProvider.updateUserAttributes(
                {
                    AccessToken: params.accessToken,
                    UserAttributes: userAttributes
                },
                (err) => {
                    if (err instanceof Error) {
                        reject(new factory.errors.Argument('profile', err.message));
                    } else {
                        resolve();
                    }
                });
        });
    }

    /**
     * 削除
     */
    public async deleteById(params: {
        userId: string;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.listUsers(
                {
                    UserPoolId: this.userPoolId,
                    Filter: `sub="${params.userId}"`
                },
                (listUsersErr, data) => {
                    if (listUsersErr instanceof Error) {
                        reject(listUsersErr);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore if: please write tests */
                        if (data.Users === undefined) {
                            reject(new factory.errors.NotFound('User'));
                        } else {
                            const user = data.Users.shift();
                            if (user === undefined || user.Username === undefined) {
                                reject(new factory.errors.NotFound('User'));
                            } else {
                                this.cognitoIdentityServiceProvider.adminDeleteUser(
                                    {
                                        UserPoolId: this.userPoolId,
                                        Username: user.Username
                                    },
                                    (err) => {
                                        if (err instanceof Error) {
                                            reject(err);
                                        } else {
                                            resolve();
                                        }
                                    }
                                );
                            }
                        }
                    }
                });
        });
    }

    /**
     * 無効化する
     */
    public async disable(params: {
        username: string;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.adminDisableUser(
                {
                    UserPoolId: this.userPoolId,
                    Username: params.username
                },
                (err) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * 検索
     */
    public async search(params: {
        id?: string;
        username?: string;
        email?: string;
        telephone?: string;
        givenName?: string;
        familyName?: string;
    }) {
        return new Promise<IPerson[]>((resolve, reject) => {
            const request: AWS.CognitoIdentityServiceProvider.Types.ListUsersRequest = {
                // Limit: 60,
                UserPoolId: this.userPoolId
            };

            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.id !== undefined) {
                request.Filter = `sub^="${params.id}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.username !== undefined) {
                request.Filter = `username^="${params.username}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.email !== undefined) {
                request.Filter = `email^="${params.email}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.telephone !== undefined) {
                request.Filter = `phone_number^="${params.telephone}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.givenName !== undefined) {
                request.Filter = `given_name^="${params.givenName}"`;
            }
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore else */
            if (params.familyName !== undefined) {
                request.Filter = `family_name^="${params.familyName}"`;
            }

            this.cognitoIdentityServiceProvider.listUsers(
                request,
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        // tslint:disable-next-line:no-single-line-block-comment
                        /* istanbul ignore if: please write tests */
                        if (data.Users === undefined) {
                            reject(new factory.errors.NotFound('User'));
                        } else {
                            resolve(data.Users.map((u) => CognitoRepository.ATTRIBUTE2PERSON({
                                username: u.Username,
                                userPoolId: this.userPoolId,
                                attributes: <AttributeListType>u.Attributes
                            })));
                        }
                    }
                });
        });
    }
}
