package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"extract-file/models"
)

// parseUsageFromResult extracts token usage from the OpenRouter JSON response.
func parseUsageFromResult(result map[string]interface{}, fallbackModel string) *models.TokenUsage {
	usageRaw, ok := result["usage"].(map[string]interface{})
	if !ok {
		return nil
	}
	model := fallbackModel
	if m, ok := result["model"].(string); ok && m != "" {
		model = m
	}
	return &models.TokenUsage{
		Model:            model,
		PromptTokens:     int(math.Round(toFloat64(usageRaw["prompt_tokens"]))),
		CompletionTokens: int(math.Round(toFloat64(usageRaw["completion_tokens"]))),
		TotalTokens:      int(math.Round(toFloat64(usageRaw["total_tokens"]))),
	}
}

func toFloat64(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	default:
		return 0
	}
}

func ExtractImageText(file io.Reader) (string, *models.TokenUsage, error) {

	imgBytes, err := io.ReadAll(file)
	if err != nil {
		return "", nil, err
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

	return callOpenRouterChat(payload, "openai/gpt-4o-mini")
}

func TranscribeAudio(file io.Reader, fileName string) (string, *models.TokenUsage, error) {

	audioBytes, err := io.ReadAll(file)
	if err != nil {
		return "", nil, err
	}

	return transcribeViaChatCompletions(audioBytes, fileName)
}

func callOpenRouterChat(payload map[string]interface{}, fallbackModel string) (string, *models.TokenUsage, error) {

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}

	req, err := http.NewRequest(
		"POST",
		"https://openrouter.ai/api/v1/chat/completions",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return "", nil, err
	}

	req.Header.Set("Authorization", "Bearer "+os.Getenv("OPENROUTER_API_KEY"))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 60 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", nil, errors.New("openrouter API failed")
	}

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return "", nil, err
	}

	usage := parseUsageFromResult(result, fallbackModel)

	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", usage, errors.New("invalid openrouter response")
	}

	message := choices[0].(map[string]interface{})["message"].(map[string]interface{})
	content := message["content"].(string)

	return content, usage, nil
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

func normalizeAudioFormat(ext string) string {
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "mp3", "wav", "m4a", "ogg", "flac", "aac", "aiff":
		return strings.ToLower(strings.TrimPrefix(ext, "."))
	case "mpeg", "mpga":
		return "mp3"
	default:
		return "mp3"
	}
}

func transcribeViaChatCompletions(audioBytes []byte, fileName string) (string, *models.TokenUsage, error) {

	openRouterKey := os.Getenv("OPENROUTER_API_KEY")
	if openRouterKey == "" {
		return "", nil, errors.New("OPENROUTER_API_KEY not set")
	}

	audioFormat := normalizeAudioFormat(filepath.Ext(fileName))
	base64Audio := base64.StdEncoding.EncodeToString(audioBytes)

	payload := map[string]interface{}{
		"model": "openai/gpt-4o-audio-preview", // ✅ IMPORTANT
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": "Please transcribe this audio file. Provide the full transcription.",
					},
					{
						"type": "input_audio",
						"input_audio": map[string]string{
							"data":   base64Audio,
							"format": audioFormat,
						},
					},
				},
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", nil, err
	}

	req, err := http.NewRequest(
		"POST",
		"https://openrouter.ai/api/v1/chat/completions",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return "", nil, err
	}

	req.Header.Set("Authorization", "Bearer "+openRouterKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}

	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("openrouter error (%d): %s", resp.StatusCode, string(body))
	}

	text, usage, err := parseTranscriptionBody(body)
	return text, usage, err
}

func parseTranscriptionBody(body []byte) (string, *models.TokenUsage, error) {
	if text := strings.TrimSpace(string(body)); text != "" && !json.Valid(body) {
		return text, nil, nil
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", nil, err
	}

	usage := parseUsageFromResult(result, "openai/gpt-4o-audio-preview")

	if text := firstNonEmptyString(
		getMapString(result, "text"),
		getMapString(result, "transcript"),
		getMapString(result, "output_text"),
	); text != "" {
		return text, usage, nil
	}

	if data, ok := result["data"].(map[string]interface{}); ok {
		if text := firstNonEmptyString(
			getMapString(data, "text"),
			getMapString(data, "transcript"),
			getMapString(data, "output_text"),
		); text != "" {
			return text, usage, nil
		}
	}

	if text := extractTextFromChatShape(result); text != "" {
		return text, usage, nil
	}

	return "", usage, errors.New("transcription response did not contain text")
}
