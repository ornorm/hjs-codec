/** @babel */
import * as util from "hjs-core/lib/util";
import * as char from "hjs-core/lib/char";
import {ByteBuffer} from 'hjs-io/lib/buffer';
import {Codec} from './codec';

const CA = char.stringToCharBuffer("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
const IA = ByteBuffer.createBuffer({ capacity: 256 });

util.fill(IA, -1);
for (let i = 0, iS = CA.length; i < iS; i++) {
    IA[CA[i]] = i;
}
IA[char.EQUAL] = 0;

export const Base64 = {

    encodeToChar: (sArr=null, lineSep=false) => {
        let sLen = sArr !== null ? sArr.length : 0;
        if (sLen === 0) {
            return [];
        }
        let eLen = (sLen / 3) * 3;              // Length of even 24-bits.
        let cCnt = ((sLen - 1) / 3 + 1) << 2;   // Returned character count
        let dLen = cCnt + (lineSep ? (cCnt - 1) / 76 << 1 : 0); // Length of returned array
        let dArr = ByteBuffer.createBuffer({ capacity:dLen });
        // Encode even 24-bits
        for (let s = 0, d = 0, cc = 0; s < eLen;) {
            // Copy next three bytes into lower 24 bits of int, paying attension to sign.
            let i = (sArr[s++] & 0xff) << 16 | (sArr[s++] & 0xff) << 8 | (sArr[s++] & 0xff);
            // Encode the int into four chars
            dArr[d++] = CA[(i >>> 18) & 0x3f];
            dArr[d++] = CA[(i >>> 12) & 0x3f];
            dArr[d++] = CA[(i >>> 6) & 0x3f];
            dArr[d++] = CA[i & 0x3f];
            // Add optional line separator
            if (lineSep && ++cc == 19 && d < dLen - 2) {
                dArr[d++] = char.CARRIAGE_RETURN;
                dArr[d++] = char.NEWLINE;
                cc = 0;
            }
        }
        // Pad and encode last bits if source isn't even 24 bits.
        let left = sLen - eLen; // 0 - 2.
        if (left > 0) {
            // Prepare the int
            let i = ((sArr[eLen] & 0xff) << 10) | (left === 2 ? ((sArr[sLen - 1] & 0xff) << 2) : 0);
            // Set last four chars
            dArr[dLen - 4] = CA[i >> 12];
            dArr[dLen - 3] = CA[(i >>> 6) & 0x3f];
            dArr[dLen - 2] = left === 2 ? CA[i & 0x3f] : char.EQUAL;
            dArr[dLen - 1] = char.EQUAL;
        }
        return dArr;
    },

    decodeChar: (sArr=null) => {
        // Check special case
        let sLen = sArr !== null ? sArr.length : 0;
        if (sLen == 0) {
            return [];
        }
        // Count illegal characters (including '\r', '\n') to know what size the returned array will be,
        // so we don't have to reallocate & copy it later.
        let sepCnt = 0; // Number of separator characters. (Actually illegal characters, but that's a bonus...)
        for (let i = 0; i < sLen; i++)  {
            // If input is "pure" (I.e. no line separators or illegal chars) base64 this loop can be commented out.
            if (IA[sArr[i]] < 0) {
                sepCnt++;
            }
        }
        // Check so that legal chars (including '=') are evenly divideable by 4 as specified in RFC 2045.
        if ((sLen - sepCnt) % 4 !== 0) {
            return null;
        }
        let pad = 0;
        for (let i = sLen; i > 1 && IA[sArr[--i]] <= 0;) {
            if (sArr[i] === char.EQUAL) {
                pad++;
            }
        }
        let len = ((sLen - sepCnt) * 6 >> 3) - pad;
        let dArr = ByteBuffer.createBuffer({ capacity:len });       // Preallocate byte[] of exact length
        for (let s = 0, d = 0; d < len;) {
            // Assemble three bytes into an int from four "valid" characters.
            let i = 0;
            for (let j = 0; j < 4; j++) {
                // j only increased if a valid char was found.
                let c = IA[sArr[s++]];
                if (c >= 0) {
                    i |= c << (18 - j * 6);
                } else {
                    j--;
                }
            }
            // Add the bytes
            dArr[d++] = (i >> 16);
            if (d < len) {
                dArr[d++]= (i >> 8);
                if (d < len) {
                    dArr[d++] = i;
                }
            }
        }
        return dArr;
    },

    decodeCharFast: (sArr=null) => {
        // Check special case
        let sLen = sArr !== null ? sArr.length : 0;
        if (sLen === 0) {
            return [];
        }
        let sIx = 0, eIx = sLen - 1;    // Start and end index after trimming.
        // Trim illegal chars from start
        while (sIx < eIx && IA[sArr[sIx]] < 0) {
            sIx++;
        }
        // Trim illegal chars from end
        while (eIx > 0 && IA[sArr[eIx]] < 0) {
            eIx--;
        }
        // get the padding count (=) (0, 1 or 2)
        let pad = sArr[eIx] === char.EQUAL ? (sArr[eIx - 1] === char.EQUAL ? 2 : 1) : 0;  // Count '=' at end.
        let cCnt = eIx - sIx + 1;   // Content count including possible separators
        let sepCnt = sLen > 76 ? (sArr[76] === char.CARRIAGE_RETURN ? cCnt / 78 : 0) << 1 : 0;
        let len = ((cCnt - sepCnt) * 6 >> 3) - pad; // The number of decoded bytes
        let dArr = ByteBuffer.createBuffer({ capacity:len });       // Preallocate byte[] of exact length
        // Decode all but the last 0 - 2 bytes.
        let d = 0;
        for (let cc = 0, eLen = (len / 3) * 3; d < eLen;) {
            // Assemble three bytes into an int from four "valid" characters.
            let i = IA[sArr[sIx++]] << 18 | IA[sArr[sIx++]] << 12 | IA[sArr[sIx++]] << 6 | IA[sArr[sIx++]];
            // Add the bytes
            dArr[d++] = (i >> 16);
            dArr[d++] = (i >> 8);
            dArr[d++] = i;
            // If line separator, jump over it.
            if (sepCnt > 0 && ++cc === 19) {
                sIx += 2;
                cc = 0;
            }
        }
        if (d < len) {
            // Decode last 1-3 bytes (incl '=') into 1-3 bytes
            let i = 0;
            for (let j = 0; sIx <= eIx - pad; j++) {
                i |= IA[sArr[sIx++]] << (18 - j * 6);
            }
            for (let r = 16; d < len; r -= 8) {
                dArr[d++] = (i >> r);
            }
        }
        return dArr;
    },

    encodeToByte: (sArr=null, lineSep=false) => {
        // Check special case
        let sLen = sArr !== null ? sArr.length : 0;
        if (sLen === 0) {
            return [];
        }
        let eLen = (sLen / 3) * 3;                              // Length of even 24-bits.
        let cCnt = ((sLen - 1) / 3 + 1) << 2;                   // Returned character count
        let dLen = cCnt + (lineSep ? (cCnt - 1) / 76 << 1 : 0); // Length of returned array
        let dArr = ByteBuffer.createBuffer({ capacity:dLen });
        // Encode even 24-bits
        for (let s = 0, d = 0, cc = 0; s < eLen;) {
            // Copy next three bytes into lower 24 bits of int, paying attension to sign.
            let i = (sArr[s++] & 0xff) << 16 | (sArr[s++] & 0xff) << 8 | (sArr[s++] & 0xff);
            // Encode the int into four chars
            dArr[d++] = CA[(i >>> 18) & 0x3f];
            dArr[d++] = CA[(i >>> 12) & 0x3f];
            dArr[d++] = CA[(i >>> 6) & 0x3f];
            dArr[d++] = CA[i & 0x3f];
            // Add optional line separator
            if (lineSep && ++cc === 19 && d < dLen - 2) {
                dArr[d++] = char.CARRIAGE_RETURN;
                dArr[d++] = char.NEWLINE;
                cc = 0;
            }
        }
        // Pad and encode last bits if source isn't an even 24 bits.
        let left = sLen - eLen; // 0 - 2.
        if (left > 0) {
            // Prepare the int
            let i = ((sArr[eLen] & 0xff) << 10) | (left === 2 ? ((sArr[sLen - 1] & 0xff) << 2) : 0);
            // Set last four chars
            dArr[dLen - 4] = CA[i >> 12];
            dArr[dLen - 3] = CA[(i >>> 6) & 0x3f];
            dArr[dLen - 2] = left === 2 ? CA[i & 0x3f] : char.EQUAL;
            dArr[dLen - 1] = char.EQUAL;
        }
        return dArr;
    },

    decodeByte: (sArr) => {
        // Check special case
        let sLen = sArr.length;
        // Count illegal characters (including '\r', '\n') to know what size the returned array will be,
        // so we don't have to reallocate & copy it later.
        let sepCnt = 0; // Number of separator characters. (Actually illegal characters, but that's a bonus...)
        for (let i = 0; i < sLen; i++) {
            // If input is "pure" (I.e. no line separators or illegal chars) base64 this loop can be commented out.
            if (IA[sArr[i] & 0xff] < 0) {
                sepCnt++;
            }
        }
        // Check so that legal chars (including '=') are evenly divideable by 4 as specified in RFC 2045.
        if ((sLen - sepCnt) % 4 !== 0) {
            return null;
        }
        let pad = 0;
        for (let i = sLen; i > 1 && IA[sArr[--i] & 0xff] <= 0;) {
            if (sArr[i] === char.EQUAL) {
                pad++;
            }
        }
        let len = ((sLen - sepCnt) * 6 >> 3) - pad;
        let dArr = ByteBuffer.createBuffer({ capacity:len });       // Preallocate byte[] of exact length
        for (let s = 0, d = 0; d < len;) {
            // Assemble three bytes into an int from four "valid" characters.
            let i = 0;
            for (let j = 0; j < 4; j++) {
                // j only increased if a valid char was found.
                let c = IA[sArr[s++] & 0xff];
                if (c >= 0) {
                    i |= c << (18 - j * 6);
                } else {
                    j--;
                }
            }
            // Add the bytes
            dArr[d++] = (i >> 16);
            if (d < len) {
                dArr[d++] = (i >> 8);
                if (d < len) {
                    dArr[d++] = i;
                }
            }
        }
        return dArr;
    },

    decodeByteFast: (sArr=null) => {
        // Check special case
        let sLen = sArr !== null ? sArr.length : 0;
        if (sLen === 0) {
            return [];
        }
        let sIx = 0, eIx = sLen - 1;    // Start and end index after trimming.
        // Trim illegal chars from start
        while (sIx < eIx && IA[sArr[sIx] & 0xff] < 0) {
            sIx++;
        }
        // Trim illegal chars from end
        while (eIx > 0 && IA[sArr[eIx] & 0xff] < 0) {
            eIx--;
        }
        // get the padding count (=) (0, 1 or 2)
        let pad = sArr[eIx] === char.EQUAL ? (sArr[eIx - 1] === char.EQUAL ? 2 : 1) : 0;  // Count '=' at end.
        let cCnt = eIx - sIx + 1;   // Content count including possible separators
        let sepCnt = sLen > 76 ? (sArr[76] === char.CARRIAGE_RETURN ? cCnt / 78 : 0) << 1 : 0;
        let len = ((cCnt - sepCnt) * 6 >> 3) - pad; // The number of decoded bytes
        let dArr = ByteBuffer.createBuffer({ capacity:len });       // Preallocate byte[] of exact length
        // Decode all but the last 0 - 2 bytes.
        let d = 0;
        for (let cc = 0, eLen = (len / 3) * 3; d < eLen;) {
            // Assemble three bytes into an int from four "valid" characters.
            let i = IA[sArr[sIx++]] << 18 | IA[sArr[sIx++]] << 12 | IA[sArr[sIx++]] << 6 | IA[sArr[sIx++]];
            // Add the bytes
            dArr[d++] = (i >> 16);
            dArr[d++] = (i >> 8);
            dArr[d++] = i;
            // If line separator, jump over it.
            if (sepCnt > 0 && ++cc === 19) {
                sIx += 2;
                cc = 0;
            }
        }
        if (d < len) {
            // Decode last 1-3 bytes (incl '=') into 1-3 bytes
            let i = 0;
            for (let j = 0; sIx <= eIx - pad; j++) {
                i |= IA[sArr[sIx++]] << (18 - j * 6);
            }
            for (let r = 16; d < len; r -= 8) {
                dArr[d++] = (i >> r);
            }
        }
        return dArr;
    },

    encodeToString: (sArr=null, lineSep=false) => {
        // Reuse char[] since we can't create a String incrementally anyway and StringBuffer/Builder would be slower.
        let buffer = Base64.encodeToChar(sArr, lineSep);
        return char.charBufferToString(buffer);
    },

    decodeString: (str=null) => {
        // Check special case
        let sLen = str !== null ? str.length : 0;
        if (sLen === 0) {
            return [];
        }
        // Count illegal characters (including '\r', '\n') to know what size the returned array will be,
        // so we don't have to reallocate & copy it later.
        let sepCnt = 0; // Number of separator characters. (Actually illegal characters, but that's a bonus...)
        for (let i = 0; i < sLen; i++) {
            // If input is "pure" (I.e. no line separators or illegal chars) base64 this loop can be commented out.
            if (IA[str.charCodeAt(i)] < 0) {
                sepCnt++;
            }
        }
        // Check so that legal chars (including '=') are evenly divideable by 4 as specified in RFC 2045.
        if ((sLen - sepCnt) % 4 !== 0) {
            return null;
        }
        // Count '=' at end
        let pad = 0;
        for (let i = sLen; i > 1 && IA[str.charCodeAt(--i)] <= 0;) {
            if (str.charCodeAt(i) === char.EQUAL) {
                pad++;
            }
        }
        let len = ((sLen - sepCnt) * 6 >> 3) - pad;
        let dArr = ByteBuffer.createBuffer({ capacity:len });       // Preallocate byte[] of exact length
        for (let s = 0, d = 0; d < len;) {
            // Assemble three bytes into an int from four "valid" characters.
            let i = 0;
            for (let j = 0; j < 4; j++) {
                // j only increased if a valid char was found.
                let c = IA[str.charCodeAt(s++)];
                if (c >= 0) {
                    i |= c << (18 - j * 6);
                } else {
                    j--;
                }
            }
            // Add the bytes
            dArr[d++] = (i >> 16);
            if (d < len) {
                dArr[d++] = (i >> 8);
                if (d < len) {
                    dArr[d++] = i;
                }
            }
        }
        return dArr;
    },

    decodeStringFast: (s) => {
        // Check special case
        let sLen = s.length();
        if (sLen === 0) {
            return [];
        }
        let sIx = 0, eIx = sLen - 1;    // Start and end index after trimming.
        // Trim illegal chars from start
        while (sIx < eIx && IA[s.charCodeAt(sIx) & 0xff] < 0) {
            sIx++;
        }
        // Trim illegal chars from end
        while (eIx > 0 && IA[s.charCodeAt(eIx) & 0xff] < 0) {
            eIx--;
        }
        // get the padding count (=) (0, 1 or 2)
        let pad = s.charCodeAt(eIx) === char.EQUAL ? (s.charCodeAt(eIx - 1) === char.EQUAL ? 2 : 1) : 0;  // Count '=' at end.
        let cCnt = eIx - sIx + 1;   // Content count including possible separators
        let sepCnt = sLen > 76 ? (s.charCodeAt(76) === char.CARRIAGE_RETURN ? cCnt / 78 : 0) << 1 : 0;
        let len = ((cCnt - sepCnt) * 6 >> 3) - pad; // The number of decoded bytes
        let dArr = ByteBuffer.createBuffer({ capacity:len });       // Preallocate byte[] of exact length
        // Decode all but the last 0 - 2 bytes.
        let d = 0;
        for (let cc = 0, eLen = (len / 3) * 3; d < eLen;) {
            // Assemble three bytes into an int from four "valid" characters.
            let i = IA[s.charCodeAt(sIx++)] << 18 | IA[s.charCodeAt(sIx++)] << 12 | IA[s.charCodeAt(sIx++)] << 6 | IA[s.charCodeAt(sIx++)];
            // Add the bytes
            dArr[d++] = (i >> 16);
            dArr[d++] = (i >> 8);
            dArr[d++] = i;
            // If line separator, jump over it.
            if (sepCnt > 0 && ++cc === 19) {
                sIx += 2;
                cc = 0;
            }
        }
        if (d < len) {
            // Decode last 1-3 bytes (incl '=') into 1-3 bytes
            let i = 0;
            for (let j = 0; sIx <= eIx - pad; j++) {
                i |= IA[s.charCodeAt(sIx++)] << (18 - j * 6);
            }
            for (let r = 16; d < len; r -= 8) {
                dArr[d++] = (i >> r);
            }
        }
        return dArr;
    }

};

export class Base64Codec extends Codec {

    constructor() {
        super();
    }

    decode(output) {
        return Base64.decodeString(output);
    }

    encode(input=null) {
        return Base64.encodeToString(char.stringToCharBuffer(input));
    }
}
