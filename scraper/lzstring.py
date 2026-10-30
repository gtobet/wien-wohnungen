"""Minimal port of lz-string's decompressFromBase64 (immowelt embeds its search data that way)."""

_KEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
_REV = {c: i for i, c in enumerate(_KEY)}


def decompress_from_base64(data: str) -> str:
    if not data:
        return ""
    return _decompress(len(data), 32, lambda i: _REV[data[i]])


def _decompress(length, reset_value, get_next):
    dictionary = {0: 0, 1: 1, 2: 2}
    enlarge_in = 4
    dict_size = 4
    num_bits = 3
    result = []
    pos = [reset_value, get_next(0), 1]  # position, val, index

    def read_bits(n):
        bits = 0
        power = 1
        while power != (1 << n):
            resb = pos[1] & pos[0]
            pos[0] >>= 1
            if pos[0] == 0:
                pos[0] = reset_value
                pos[1] = get_next(pos[2]) if pos[2] < length else 0
                pos[2] += 1
            bits |= (1 if resb > 0 else 0) * power
            power <<= 1
        return bits

    nxt = read_bits(2)
    if nxt == 0:
        c = chr(read_bits(8))
    elif nxt == 1:
        c = chr(read_bits(16))
    else:
        return ""
    dictionary[3] = c
    w = c
    result.append(c)
    while True:
        if pos[2] > length:
            return ""
        c = read_bits(num_bits)
        if c == 0:
            dictionary[dict_size] = chr(read_bits(8))
            dict_size += 1
            c = dict_size - 1
            enlarge_in -= 1
        elif c == 1:
            dictionary[dict_size] = chr(read_bits(16))
            dict_size += 1
            c = dict_size - 1
            enlarge_in -= 1
        elif c == 2:
            return "".join(result)
        if enlarge_in == 0:
            enlarge_in = 1 << num_bits
            num_bits += 1
        if c in dictionary:
            entry = dictionary[c]
        elif c == dict_size:
            entry = w + w[0]
        else:
            return ""
        result.append(entry)
        dictionary[dict_size] = w + entry[0]
        dict_size += 1
        enlarge_in -= 1
        w = entry
        if enlarge_in == 0:
            enlarge_in = 1 << num_bits
            num_bits += 1
