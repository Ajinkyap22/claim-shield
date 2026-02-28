package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"
)

func ExtractImageText(file io.Reader) (string, error) {

	imgBytes, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}

	base64Image := base64.StdEncoding.EncodeToString(imgBytes)

	payload := map[string]interface{}{
		"model": "openai/gpt-4o-mini",
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": "Extract all text from this image exactly as written.",
					},
					{
						"type": "image_url",
						"image_url": map[string]string{
							"url": "data:image/jpeg;base64," + base64Image,
						},
					},
				},
			},
		},
	}

	return callOpenRouterChat(payload)
}

func TranscribeAudio(file io.Reader, fileName string) (string, error) {

	audioBytes, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}

	openRouterKey := os.Getenv("OPENROUTER_API_KEY")
	if openRouterKey == "" {
		return "", errors.New("OPENROUTER_API_KEY not set")
	}

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)

	// Add audio file
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(audioBytes); err != nil {
		return "", err
	}

	// Add model field
	if err := writer.WriteField("model", "openai/whisper-1"); err != nil {
		return "", err
	}
	if err := writer.WriteField("response_format", "json"); err != nil {
		return "", err
	}

	if err := writer.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequest(
		"POST",
		"https://openrouter.ai/api/v1/audio/transcriptions",
		&requestBody,
	)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+openRouterKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("transcription request failed (%d): %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if text := strings.TrimSpace(string(body)); text != "" && !json.Valid(body) {
		return text, nil
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	if text := firstNonEmptyString(
		getMapString(result, "text"),
		getMapString(result, "transcript"),
		getMapString(result, "output_text"),
	); text != "" {
		return text, nil
	}

	if data, ok := result["data"].(map[string]interface{}); ok {
		if text := firstNonEmptyString(
			getMapString(data, "text"),
			getMapString(data, "transcript"),
			getMapString(data, "output_text"),
		); text != "" {
			return text, nil
		}
	}

	if text := extractTextFromChatShape(result); text != "" {
		return text, nil
	}

	return "", errors.New("transcription response did not contain text")
}

func callOpenRouterChat(payload map[string]interface{}) (string, error) {

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest(
		"POST",
		"https://openrouter.ai/api/v1/chat/completions",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+os.Getenv("OPENROUTER_API_KEY"))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 60 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", errors.New("openrouter API failed")
	}

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return "", err
	}

	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", errors.New("invalid openrouter response")
	}

	message := choices[0].(map[string]interface{})["message"].(map[string]interface{})
	content := message["content"].(string)

	return content, nil
}

func firstNonEmptyString(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func getMapString(m map[string]interface{}, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}

func extractTextFromChatShape(result map[string]interface{}) string {
	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return ""
	}

	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return ""
	}
	message, ok := choice["message"].(map[string]interface{})
	if !ok {
		return ""
	}
	content, ok := message["content"]
	if !ok {
		return ""
	}

	switch v := content.(type) {
	case string:
		return strings.TrimSpace(v)
	case []interface{}:
		var out strings.Builder
		for _, item := range v {
			part, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			if getMapString(part, "type") == "text" {
				if t := getMapString(part, "text"); t != "" {
					if out.Len() > 0 {
						out.WriteByte('\n')
					}
					out.WriteString(t)
				}
			}
		}
		return strings.TrimSpace(out.String())
	default:
		return ""
	}
}
