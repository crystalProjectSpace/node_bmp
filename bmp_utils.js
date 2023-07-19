'use strict'

const { writeFile } = require('node:fs/promises')

const FILE_HEADER_SIZE = 14	// размер заголовка BMP-файла
const IMG_HEADER_SIZE = 40  // размер заголовка метаданных изображения
const _B = 66				// код символа "B" в ASCII
const _M = 77				// код символа "M" в ASCII
const PALETTE_BYTE_SIZE = 4 // количество байтов в одном элементе палитры (R + G + B + резервное значение, заполняемое нулями)

const PIX_1BIT = 8 // количество пикселей в одном байте для монохромного варианта
const PIX_4BIT = 2 // количество пикселей в одном байте для 4-битного варианта

const DPI_200_PIX_PER_M = 7874 // количество пикселей*метр при разрешении 200dpi

/**
* @description получить размер пиксельного блока в байтах
* @returns
*/
const getPixelBytes = function(width, height, encoding = 24) {
	let rowSize = 0
	switch(encoding) {
		case 1: rowSize = Math.round(width / 8); break;
		case 4: rowSize = Math.round(width / 2); break;
		case 8: rowSize = width; break;
		case 16: rowSize = 2 * width; break;
		case 24: rowSize = 3 * width; break;
		case 32: rowSize = 4 * width; break;
		default: rowSize = 3 * width; break;
	}
	const delta = rowSize % 4
	const rowSizeBase = rowSize
	// Each row of BMP is padded with zeroes (to contain fixed amount of 4-byte blocks)
	rowSize = (rowSize - delta) + (delta > 0 ? 4 : 0)

	return {
		pixelSize: rowSize * height,
		rowSizeBase,
		deltaBase: rowSize - rowSizeBase
	}
}
/**
* @description получить размер палитры в зависимости от цветового разрешения
*/
const getPaletteBytes = function(encoding) {
	switch(encoding) {
		case 1: return 2 * PALETTE_BYTE_SIZE;
		case 4: return 16 * PALETTE_BYTE_SIZE;
		case 8: return 256 * PALETTE_BYTE_SIZE;
		default: return 0;
	}
}
/**
* @description представить значение в виде набора 4 байтов
*/
const split2bytes = function(val) {
	const byteSecond = val >> 8
	const byteThird = byteSecond >> 8
	const byteFourth = byteThird >> 8
	return [val & 255, byteSecond & 255, byteThird & 255, byteFourth & 255]
}

/**
* @description сформировать заголовок
*/
const createHeader = function(width, height, encoding) {
	const { pixelSize, rowSizeBase, deltaBase } = getPixelBytes(width, height, encoding)
	const paletteSize = getPaletteBytes(encoding)
	const headerSize = FILE_HEADER_SIZE + IMG_HEADER_SIZE + paletteSize
	const fileSize = headerSize + pixelSize
	
	const bytes = new Uint8Array(fileSize)
	
	const f_byte = split2bytes(fileSize)
	const h_byte = split2bytes(headerSize)
	const width_byte = split2bytes(width)
	const height_byte = split2bytes(height)
	const resolution_byte = split2bytes(DPI_200_PIX_PER_M)
	
	let paletteItems = 0
	if(encoding === 1) paletteItems = 2
	if(encoding === 4) paletteItems = 16
	if(encoding === 8) paletteItems = 256
	let palette_byte = split2bytes(paletteItems)
	// заполнение заголовка данных об изображении
	bytes[0] = _B
	bytes[1] = _M
	bytes[2] = f_byte[0]
	bytes[3] = f_byte[1]
	bytes[4] = f_byte[2]
	bytes[5] = f_byte[3]
	bytes[6] = 0
	bytes[7] = 0
	bytes[8] = 0
	bytes[9] = 0
	bytes[10] = h_byte[0]
	bytes[11] = h_byte[1]
	bytes[12] = h_byte[2]
	bytes[13] = h_byte[3]
	//заполнение метаданных файла
	bytes[14] = IMG_HEADER_SIZE	
	bytes[15] = 0
	bytes[16] = 0
	bytes[17] = 0
	bytes[18] = width_byte[0]
	bytes[19] = width_byte[1]
	bytes[20] = width_byte[2]
	bytes[21] = width_byte[3]	
	bytes[22] = height_byte[0]
	bytes[23] = height_byte[1]
	bytes[24] = height_byte[2]
	bytes[25] = height_byte[3]
	bytes[26] = 1
	bytes[27] = 0	
	bytes[28] = encoding
	bytes[29] = 0
	bytes[30] = 0
	bytes[31] = 0
	bytes[32] = 0
	bytes[33] = 0	
	bytes[34] = 0
	bytes[35] = 0
	bytes[36] = 0
	bytes[37] = 0	
	bytes[38] = resolution_byte[0]
	bytes[39] = resolution_byte[1]
	bytes[40] = resolution_byte[2]
	bytes[41] = resolution_byte[3]	
	bytes[42] = resolution_byte[0]
	bytes[43] = resolution_byte[1]
	bytes[44] = resolution_byte[2]
	bytes[45] = resolution_byte[3]
	bytes[46] = palette_byte[0]
	bytes[47] = palette_byte[1]
	bytes[48] = 0
	bytes[49] = 0	
	bytes[50] = 0
	bytes[51] = 0
	bytes[52] = 0
	bytes[53] = 0
	
	return { bytes, rowSizeBase, deltaBase }
}
/**
* @description заполнить палитру
*/
const fillPalette = function(bytes, palette) {
	const paletteSize = palette.length 
	let k = FILE_HEADER_SIZE + IMG_HEADER_SIZE

	for(let i = 0; i < paletteSize; i++) {
		bytes[k++] = palette[i].R
		bytes[k++] = palette[i].G
		bytes[k++] = palette[i].B
		bytes[k++] = 0
	}
}
/**
 * @warning строки в BMP идут снизу вверх, порядок записи должен быть обращен
 */
/**
* @description записать изображение в монохромном формате
*/
const fillColorData_1 = function(bytes, clArray, paletteSize, rowSize, delta) {
	const pointSize = clArray.length
	let k = FILE_HEADER_SIZE + IMG_HEADER_SIZE + paletteSize
	let i_row = 0
	const deltaRow = rowSize * PIX_1BIT
	let i0 = pointSize - deltaRow
	for(let i = 0; i < pointSize; i += 8) {
		const i_active = (i_row << 3) + i0
		bytes[k++] = clArray[i_active + 7] +
			(clArray[i_active + 6] << 1) +
			(clArray[i_active + 5] << 2) + 
			(clArray[i_active + 4] << 3) + 
			(clArray[i_active + 3] << 4) +
			(clArray[i_active + 2] << 5) +
			(clArray[i_active + 1] << 6) +
			(clArray[i_active] << 7)

		if(++i_row === rowSize) {
			k += delta
			i_row = 0
			i0 -= deltaRow
		}
	}
}
/**
* @description записать изображение в 4-бит формате
*/
const fillColorData_4 = function(bytes, clArray, paletteSize, rowSize, delta) {
	let k = FILE_HEADER_SIZE + IMG_HEADER_SIZE + paletteSize
	let i_row = 0
	const pointSize = clArray.length
	const deltaRow = rowSize * PIX_4BIT
	let i0 = pointSize - deltaRow
	for(let i = 0; i < pointSize; i+= 2) {
		const i_active = (i_row << 1) + i0
		bytes[k++] = clArray[i_active + 1] | (clArray[i_active] << 4)
		if(++i_row === rowSize) {
			k += delta
			i_row = 0
			i0 -= deltaRow
		}
	}
}
/**
* @description записать изображение в 8-бит формате
*/
const fillColorData_8 = function(bytes, clArray, paletteSize, rowSize, delta) {
	const pointSize = clArray.length
	let i_row = 0
	let i_active = pointSize - rowSize
	let k = FILE_HEADER_SIZE + IMG_HEADER_SIZE + paletteSize
	for(let i = 0; i < pointSize; i++) {
		bytes[k++] = clArray[i_active + i_row]
		if(++i_row === rowSize) {
			k += delta
			i_row = 0
			i_active -= rowSize
		}		
	}
}
/**
* @description записать изображение в 16-бит формате
*/
const fillColorData_16 = function(bytes, clArray) {
	let k = FILE_HEADER_SIZE = 14 + IMG_HEADER_SIZE
	const pointSize = clArray.length
	for(let i = 0; i < pointSize; i++) {
		bytes[k++] = clArray[i] & 255
		bytes[k++] = (clArray[i] >> 8) & 255
 	}	
}
/**
* @description записать изображение в 24-бит формате
*/
const fillColorData_24 = function(clArray) {
	let k = FILE_HEADER_SIZE = 14 + IMG_HEADER_SIZE
	const pointSize = clArray.length
	for(let i = 0; i < pointSize; i++) {
		bytes[k++] = clArray[i] & 255
		bytes[k++] = (clArray[i] >> 8) & 255
		bytes[k++] = (clArray[i] >> 16) & 255
 	}
}
/**
* @description сохранить цветовую карту в байтовый массив формата BMP
*/
const saveAsBMP = async function(clArray, width, height, encoding, name, palette) {
	const {bytes, rowSizeBase, deltaBase} = createHeader(width, height, encoding)
	const paletteSize = palette.length * PALETTE_BYTE_SIZE
	
	if(paletteSize > 0) fillPalette(bytes, palette)
	
	switch(encoding) {
		case 1: fillColorData_1(bytes, clArray, paletteSize, rowSizeBase, deltaBase); break;
		case 4: fillColorData_4(bytes, clArray, paletteSize, rowSizeBase, deltaBase); break;
		case 8: fillColorData_8(bytes, clArray, paletteSize, rowSizeBase, deltaBase); break;
		case 16: fillColorData_16(bytes, clArray); break;
		case 24:
		default: fillColorData_24(bytes, clArray); break;
	}

	try {
		await writeFile(name, bytes)
		return 0
	} catch(err) {
		console.log(err)
		return 1
	}	
}

module.exports = { saveAsBMP }
