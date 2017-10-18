/** @babel */
export class Codec {

    constructor({ decode=null, encode=null }={}) {
        if (decode !== null) {
            this.decode = decode;
        }
        if (encode !== null) {
            this.encode = encode;
        }
    }

    decode(output) {
        return output;
    }

    encode(input) {
        return null;
    }

}

