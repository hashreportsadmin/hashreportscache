import React from 'react';

// Format name: uppercase, max 3 words, one space
const formatFullName = (val) => {
    let formatted = val.toUpperCase().replace(/[^A-Z\s]/g, '');
    formatted = formatted.replace(/\s+/g, ' '); // Single space
    const words = formatted.split(' ');
    if (words.length > 3) {
        formatted = words.slice(0, 3).join(' ');
    }
    return formatted.trimStart();
};

// Format Reg Number: TXX-XX-XXXXX
const formatRegNumber = (val, oldVal) => {
    if (!val) return 'T';
    
    // Handle backspace logic (user deleted a dash or number)
    if (oldVal && oldVal.length > val.length) {
        if (oldVal.endsWith('-')) {
            return val.slice(0, -1);
        }
        return val;
    }

    let cleaned = val.replace(/[^0-9]/g, ''); // strip everything but numbers (T is added later)
    if (cleaned.startsWith('T')) cleaned = cleaned.substring(1); // just in case
    
    let formatted = 'T';
    if (cleaned.length > 0) formatted += cleaned.substring(0, 2);
    if (cleaned.length >= 2) formatted += '-' + cleaned.substring(2, 4);
    if (cleaned.length >= 4) formatted += '-' + cleaned.substring(4, 9);
    
    return formatted;
};

// Format Phone: +255XXXXXXXXX (first X is 6 or 7)
const formatPhone = (val) => {
    if (!val || val === '+' || val.length < 4) return '+255';
    
    let digits = val.replace(/[^0-9]/g, '');
    
    if (digits.startsWith('255')) {
        digits = digits.substring(3);
    }
    if (digits.startsWith('0')) {
        digits = digits.substring(1);
    }
    
    // allow multiple wrong prefix digits to be stripped
    while (digits.length > 0 && digits[0] !== '6' && digits[0] !== '7') {
        digits = digits.substring(1);
    }
    
    return '+255' + digits.substring(0, 9);
};

// Format Email
const formatEmail = (val, oldVal) => {
    // If backspacing on the domain
    if (oldVal && oldVal.endsWith('@gmail.com') && val.length < oldVal.length) {
        return val.replace(/@.*$/, ''); 
    }
    
    if (val.includes('@') && !val.includes('@gmail.com')) {
        return val.split('@')[0] + '@gmail.com';
    }
    
    return val.replace(/@gmail\.com.*$/, '@gmail.com');
};

export { formatFullName, formatRegNumber, formatPhone, formatEmail };
export default formatEmail;
