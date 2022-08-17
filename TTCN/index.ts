import * as fs from 'fs/promises';
import { CreateReadStreamOptions } from 'fs/promises';

// Provides a convenient API for sequentially reading bytes from a file
const BinaryReader = async (file: fs.FileHandle, options?: CreateReadStreamOptions) => {
	const stream = file.createReadStream(options);
	await new Promise(resolve => stream.on('readable', resolve));

	let bytesRead = 0;

	const reader = {
		stream,
		read: (length = 1) => {
			bytesRead += length;
			return stream.read(length) as Buffer;
		},
		readChars: (length = 1) => reader.read(length).toString(),
		readString: () => {
			let string = '';
			let charCode = reader.read(1).readUInt8();
			while (charCode > 0) {
				string += String.fromCharCode(charCode);

				charCode = reader.read(1).readUInt8();
			}

			return string;
		},
		readUInt64: () => reader.read(8).readBigUInt64LE(),
		readUInt32: () => reader.read(4).readUInt32LE(),
		readUInt16: () => reader.read(2).readUInt16LE()
	};

	return reader;
};

(async () => {
	const archiveName = './WDC_pc_ProjectSeason2_ms.ttarch2';
	let archive = await fs.open(archiveName);

	let reader = await BinaryReader(archive);

	console.log(`Parsing ${archiveName}...`);

	// Read the archive header
	const type = reader.readChars(4).split('').reverse().join('');
	const size = reader.readUInt64();
	const version = reader.readChars(4).split('').reverse().join('');
	const blockSize = reader.readUInt32();
	const fileCount = reader.readUInt32();

	console.log({ type, size, version, blockSize, fileCount });

	type File = {
		hash: bigint,
		offset: bigint,
		size: number,
		nameTable: {
			chunkIndex: number,
			offset: number
		}
	};

	const files: File[] = [];

	// Read the metadata of every file
	for (let i = 0; i < fileCount; i++) {
		const hash = reader.readUInt64();
		const offset = reader.readUInt64();
		const size = reader.readUInt32();

		// ignore
		reader.readUInt32();

		const chunkIndex = reader.readUInt16();
		const chunkOffset = reader.readUInt16();

		files.push({
			hash,
			offset,
			size,
			nameTable: {
				chunkIndex,
				offset: chunkOffset
			}
		});
	}

	// Close the stream, to allow opening the read stream at a different offset later.
	reader.stream.close();
	archive = await fs.open(archiveName);

	const fileInArchive = files[0];

	// start = 24 + 28 * number of files + 65536 * chunk index + name table offset
	const nameStartOffset = 24 + 28 * fileCount + blockSize * fileInArchive.nameTable.chunkIndex + fileInArchive.nameTable.offset;
	reader = await BinaryReader(archive, { start: nameStartOffset });

	// Reads every byte as a char until a NULL (00) is found
	const fileName = reader.readString();

	// Close the stream, to allow opening the read stream at a different offset later.
	reader.stream.close();
	archive = await fs.open(archiveName);

	/*
		start = header bytes + file metadata bytes * number of files + chunk size * name table chunks + file offset`
              = 24 + 28 * number of files + chunk size * name table chunks + file offset

		end = start + file size
	 */
	const fileStartOffset = 24 + 28 * fileCount + blockSize * 1 + Number(fileInArchive.offset);
	const fileEndOffset = fileStartOffset + fileInArchive.size;
	const fileStream = archive.createReadStream({ start: fileStartOffset, end: fileEndOffset - 1 });

	// Write the bytes from the stream directly to the file
	await fs.writeFile(`./${fileName}`, fileStream);

	console.log(`Done! ${fileName} has been extracted into this directory.`);
})();