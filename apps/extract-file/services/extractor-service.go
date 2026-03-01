package services

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"extract-file/models"

	"github.com/ledongthuc/pdf"
)

func ExtractFileText(file io.Reader, filename string) (string, *models.TokenUsage, error) {

	ext := strings.ToLower(filepath.Ext(filename))

	switch ext {

	case ".pdf":
		text, err := extractPDF(file)
		return text, nil, err

	case ".docx":
		text, err := extractDOCX(file)
		return text, nil, err

	case ".png", ".jpg", ".jpeg":
		return ExtractImageText(file)

	default:
		return "", nil, errors.New("unsupported file type")
	}
}

func extractPDF(file io.Reader) (string, error) {

	tmpFile, err := os.CreateTemp("", "*.pdf")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpFile.Name())

	_, err = io.Copy(tmpFile, file)
	if err != nil {
		return "", err
	}
	tmpFile.Close()

	f, reader, err := pdf.Open(tmpFile.Name())
	if err != nil {
		return "", err
	}
	defer f.Close()

	var buf bytes.Buffer
	textReader, err := reader.GetPlainText()
	if err != nil {
		return "", err
	}

	_, err = io.Copy(&buf, textReader)
	if err != nil {
		return "", err
	}

	return buf.String(), nil
}

func extractDOCX(file io.Reader) (string, error) {

	docxBytes, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}

	readerAt := bytes.NewReader(docxBytes)
	zipReader, err := zip.NewReader(readerAt, int64(len(docxBytes)))
	if err != nil {
		return "", fmt.Errorf("invalid docx: %w", err)
	}

	var documentXML io.ReadCloser
	for _, f := range zipReader.File {
		if f.Name == "word/document.xml" {
			documentXML, err = f.Open()
			if err != nil {
				return "", err
			}
			defer documentXML.Close()
			break
		}
	}
	if documentXML == nil {
		return "", errors.New("word/document.xml not found in docx")
	}

	decoder := xml.NewDecoder(documentXML)
	var out strings.Builder

	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}

		switch t := token.(type) {
		case xml.StartElement:
			if t.Name.Local == "tab" {
				out.WriteByte('\t')
			}
			if t.Name.Local == "br" || t.Name.Local == "cr" {
				out.WriteByte('\n')
			}
		case xml.EndElement:
			if t.Name.Local == "p" {
				out.WriteByte('\n')
			}
		case xml.CharData:
			out.WriteString(string(t))
		}
	}

	return strings.TrimSpace(out.String()), nil
}
