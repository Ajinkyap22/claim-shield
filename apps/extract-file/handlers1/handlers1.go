package handlers1

import (
	"encoding/json"
	"net/http"

	"extract-file/models"
	"extract-file/services"
)

func HandleExtract(w http.ResponseWriter, r *http.Request) {

	err := r.ParseMultipartForm(200 << 20)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	response := models.ExtractedResponse{
		ClinicalNote:       r.FormValue("clinicalNote"),
		AudioFiles:         []models.ExtractedFile{},
		PolicyFiles:        []models.ExtractedFile{},
		DocumentationFiles: []models.ExtractedFile{},
	}

	// ================= AUDIO FILES =================
	audioFiles := r.MultipartForm.File["audioFiles"]
	for _, fileHeader := range audioFiles {

		file, err := fileHeader.Open()
		if err != nil {
			response.AudioFiles = append(response.AudioFiles, models.ExtractedFile{
				FileName: fileHeader.Filename,
				Error:    err.Error(),
			})
			continue
		}

		text, err := services.TranscribeAudio(file, fileHeader.Filename)
		file.Close()

		extracted := models.ExtractedFile{
			FileName: fileHeader.Filename,
			Text:     text,
		}

		if err != nil {
			extracted.Error = err.Error()
		}

		response.AudioFiles = append(response.AudioFiles, extracted)
	}

	// ================= POLICY FILES =================
	policyFiles := r.MultipartForm.File["policyFiles"]
	for _, fileHeader := range policyFiles {

		file, err := fileHeader.Open()
		if err != nil {
			response.PolicyFiles = append(response.PolicyFiles, models.ExtractedFile{
				FileName: fileHeader.Filename,
				Error:    err.Error(),
			})
			continue
		}

		text, err := services.ExtractFileText(file, fileHeader.Filename)
		file.Close()

		extracted := models.ExtractedFile{
			FileName: fileHeader.Filename,
			Text:     text,
		}

		if err != nil {
			extracted.Error = err.Error()
		}

		response.PolicyFiles = append(response.PolicyFiles, extracted)
	}

	// ================= DOCUMENTATION FILES =================
	docFiles := r.MultipartForm.File["documentationFiles"]
	for _, fileHeader := range docFiles {

		file, err := fileHeader.Open()
		if err != nil {
			response.DocumentationFiles = append(response.DocumentationFiles, models.ExtractedFile{
				FileName: fileHeader.Filename,
				Error:    err.Error(),
			})
			continue
		}

		text, err := services.ExtractFileText(file, fileHeader.Filename)
		file.Close()

		extracted := models.ExtractedFile{
			FileName: fileHeader.Filename,
			Text:     text,
		}

		if err != nil {
			extracted.Error = err.Error()
		}

		response.DocumentationFiles = append(response.DocumentationFiles, extracted)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
