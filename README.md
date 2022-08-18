# ttarch-docs
A guide to reading Telltale Archive files programmatically

# Credits
Special thanks to [Lucas Saragosa](https://github.com/LucasSaragosa) for his patience and being so open to sharing his in-depth knowledge regarding the TellTale Tool, making this document and other tools in the community possible.

# Preface
This guide assumes knowledge of number bases, specifically [binary, decimal and hexadecimal](https://www.mathsisfun.com/binary-decimal-hexadecimal.html), in addition to [Little Endian and Big Endian notation.](https://betterexplained.com/articles/understanding-big-and-little-endian-byte-order/)

Unless otherwise specified, assume Little Endian encoding and integers represented as unsigned ints.

A recommended Hex Editor for viewing the raw ttarch binary data is the [HxD Hex Editor.](https://mh-nexus.de/en/hxd/)

# Data Containers
`ttarch2` files make use of data container formats, found throughout other TellTale Tool formats.
Containers such as `TTCE` and `TTCN` are often used for these data archives, which encode their data in different ways.
An archive's data container type can be determined by reading the first four bytes as ASCII chars, then reversing the order, e.g.
`4E 43 54 54 CD 5A 05 00 00 00 00 00 34 41 54 54`
produces `4E 43 54 54`, AKA `NCTT` in ASCII.
Reversing this string yields `TTCN`, which likely stems from *Telltale Container None* or a similar acronym.

# TTCN
The TTCN data container is quite straightforward, having no encryption or compression.

## Header
It contains a "header" of 24 bytes, in the format:
```
<type: 4 byte string> <archive size: 8 byte int> <version: 4 byte string> <block size: 4 byte int> <file count: 4 byte int>
```

e.g.
```
4E 43 54 54 CD 5A 05 00 00 00 00 00 34 41 54 54 00 00 01 00 07 00 00 00
4E 43 54 54 = archive type, "NCTT"
            CD 5A 05 00 00 00 00 00 = archive size, 350925 bytes
                                    34 41 54 54 = version, "4ATT"
                                                00 00 01 00 = block size, 65536 bytes
                                                             07 00 00 00 = number of files, 7
```

## Files
Immediately after the header is the declaration of each file stored in the archive, with each file being in the 28-byte format:
```
<crc hash: 8 byte int> <offset: 8 byte int> <file size: 4 byte int> <ignore: 4 byte int> <name table chunk index: 2 byte int> <name table offset: 2 byte index> 
```

e.g.
```
8E E1 E3 34 68 92 E0 06 00 09 01 00 00 00 00 00 00 09 01 00 00 00 00 00 00 00 15 00
8E E1 E3 34 68 92 E0 06 = crc hash, 0x6E0926834E3E18E
                        00 09 01 00 00 00 00 00 = offset, 67840 bytes
                                                00 09 01 00 = file size, 67840 bytes
                                                            00 00 00 00 (ignore)
                                                                        00 00 = name table chunk index, 0
                                                                              15 00 = name table offset, 21 bytes
```

The given offset specifies how many bytes **after** the end of the name table a file can be found, which will be discussed later in this document.

NOTE: The CRC hash is represented in the **CRC64 ECMA 182** format, **using the LOWERCASE name** of the file as an input.
NOTE2: The ignored 4 bytes will always be 0.

## Name Table
After all the files, the Name Table is declared, containing the name of every file in the archive as a null terminated string.
This name table is zero-padded to fit within the block size as declared in the header (usually 65536 bytes).
If a significant number of files are present, the name table will create multiple chunks, whose contents will also be zero-padded to the block size.

The name of a file can be determined from the chunk index and offset ascertained from the previous section.
After calculating the start index (as seen below), a parser should read in the string until a NULL value is found, denoting the end of the filename.
```
start = header bytes + file metadata bytes * number of files + chunk size * chunk index + name table offset
      = 24 + 28 * number of files + chunk size * chunk index + name table offset
```

As an example, the starting offset of the name of a file in an archive with chunk size = 65536 containing 7 files, a chunk index of 0, and name table offset of 21 would be:
```
start = 24 + 28 * 7 + 65536 * 0 + 21
      = 241
```

## Files
Finally, the raw data of every file is encoded, immediately after the Name Table.
The offsets of files can thus be calculated with:
```
start = header bytes + file metadata bytes * number of files + chunk size * name table chunks + file offset`
      = 24 + 28 * number of files + chunk size * name table chunks + file offset

end = start + file size
```

As an example, if an archive with chunk size = 65536 had 7 files, 1 name table chunk, and the requested file had an offset of 67840 bytes with a size of 67840 bytes, the start and end offsets would be:
```
start = 24 + 28 * 7 + 65536 * 1 + 67840
      = 133596

end = 133596 + 67840
    = 201436
```

## Example
An example of a TTCN parser is available in the TTCN directory, containing a TypeScript implementation. 
See `TTCN/README.md` for more details.