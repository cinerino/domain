import * as factory from '@cinerino/factory';
import * as AWS from 'aws-sdk';
import { PhoneNumberFormat, PhoneNumberUtil } from 'google-libphonenumber';

/**
 * 会員リポジトリー
 * 会員情報の保管先は基本的にAmazon Cognitoです。
 */
export class CognitoRepository {
    public readonly cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider;
    constructor(cognitoIdentityServiceProvider: AWS.CognitoIdentityServiceProvider) {
        this.cognitoIdentityServiceProvider = cognitoIdentityServiceProvider;
    }
    public static ATTRIBUTE2CONTACT(userAttributes: AWS.CognitoIdentityServiceProvider.AttributeListType) {
        const contact: factory.person.IContact = {
            givenName: '',
            familyName: '',
            email: '',
            telephone: ''
        };

        userAttributes.forEach((userAttribute) => {
            switch (userAttribute.Name) {
                case 'given_name':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    contact.givenName = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'family_name':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    contact.familyName = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'email':
                    // tslint:disable-next-line:max-line-length no-single-line-block-comment
                    contact.email = (userAttribute.Value !== undefined) ? userAttribute.Value : /* istanbul ignore next: please write tests */ '';
                    break;
                case 'phone_number':
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (userAttribute.Value !== undefined) {
                        // format a phone number to a Japanese style
                        const phoneUtil = PhoneNumberUtil.getInstance();
                        const phoneNumber = phoneUtil.parse(userAttribute.Value, 'JP');
                        contact.telephone = phoneUtil.format(phoneNumber, PhoneNumberFormat.NATIONAL);
                    }
                    break;
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore next */
                default:
            }
        });

        return contact;
    }
    /**
     * 管理者権限でユーザー属性を取得する
     */
    public async  getUserAttributes(params: {
        userPooId: string;
        username: string;
    }) {
        return new Promise<factory.person.IContact>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.adminGetUser(
                {
                    UserPoolId: params.userPooId,
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
                            resolve(CognitoRepository.ATTRIBUTE2CONTACT(data.UserAttributes));
                        }
                    }
                });
        });
    }
    /**
     * 管理者権限でsubでユーザーを検索する
     */
    public async findById(params: {
        userPooId: string;
        userId: string;
    }) {
        return new Promise<factory.person.IContact>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.listUsers(
                {
                    UserPoolId: params.userPooId,
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
                                throw new factory.errors.NotFound('User');
                            }
                            resolve(CognitoRepository.ATTRIBUTE2CONTACT(user.Attributes));
                        }
                    }
                });
        });
    }
    /**
     * アクセストークンでユーザー属性を取得する
     */
    public async getUserAttributesByAccessToken(accessToken: string): Promise<factory.person.IContact> {
        return new Promise<factory.person.IContact>((resolve, reject) => {
            this.cognitoIdentityServiceProvider.getUser(
                {
                    AccessToken: accessToken
                },
                (err, data) => {
                    if (err instanceof Error) {
                        reject(err);
                    } else {
                        resolve(CognitoRepository.ATTRIBUTE2CONTACT(data.UserAttributes));
                    }
                });
        });
    }
    /**
     * 会員プロフィール更新
     */
    public async updateContactByAccessToken(params: {
        accessToken: string;
        contact: factory.person.IContact;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let formatedPhoneNumber: string;
            try {
                const phoneUtil = PhoneNumberUtil.getInstance();
                const phoneNumber = phoneUtil.parse(params.contact.telephone, 'JP');
                if (!phoneUtil.isValidNumber(phoneNumber)) {
                    throw new Error('Invalid phone number format.');
                }

                formatedPhoneNumber = phoneUtil.format(phoneNumber, PhoneNumberFormat.E164);
            } catch (error) {
                reject(new factory.errors.Argument('telephone', 'invalid phone number format'));

                return;
            }

            this.cognitoIdentityServiceProvider.updateUserAttributes(
                {
                    AccessToken: params.accessToken,
                    UserAttributes: [
                        {
                            Name: 'given_name',
                            Value: params.contact.givenName
                        },
                        {
                            Name: 'family_name',
                            Value: params.contact.familyName
                        },
                        {
                            Name: 'phone_number',
                            Value: formatedPhoneNumber
                        },
                        {
                            Name: 'email',
                            Value: params.contact.email
                        }
                    ]
                },
                (err) => {
                    if (err instanceof Error) {
                        reject(new factory.errors.Argument('contact', err.message));
                    } else {
                        resolve();
                    }
                });
        });
    }
}
