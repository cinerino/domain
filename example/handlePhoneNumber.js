const libphonenumber = require('google-libphonenumber');

const value = '+819012345678';
const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance();
const phoneNumber = phoneUtil.parse(value); // 日本の電話番号前提仕様
if (!phoneUtil.isValidNumber(phoneNumber)) {
    throw new Error('invalid phone number format.');
}
console.log(phoneUtil.format(phoneNumber, libphonenumber.PhoneNumberFormat.E164));
console.log(phoneUtil.format(phoneNumber, libphonenumber.PhoneNumberFormat.INTERNATIONAL));
console.log(phoneUtil.format(phoneNumber, libphonenumber.PhoneNumberFormat.NATIONAL));
console.log(phoneUtil.format(phoneNumber, libphonenumber.PhoneNumberFormat.RFC3966));

