// this is also one option, but in this the files data will be merged, that is why preferring the second one

// package models

// type ExtractedResponse struct {
// 	ClinicalNote      string `json:"clinicalNote"`
// 	AudioText         string `json:"audioText"`
// 	PolicyText        string `json:"policyText"`
// 	DocumentationText string `json:"documentationText"`
// }

package models

type TokenUsage struct {
	Model            string `json:"model"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
	TotalTokens      int    `json:"total_tokens"`
}

type ExtractedFile struct {
	FileName string `json:"fileName"`
	Text     string `json:"text"`
	Error    string `json:"error,omitempty"`
}

type ExtractedResponse struct {
	ClinicalNote       string          `json:"clinicalNote"`
	AudioFiles         []ExtractedFile `json:"audioFiles"`
	PolicyFiles        []ExtractedFile `json:"policyFiles"`
	DocumentationFiles []ExtractedFile `json:"documentationFiles"`
	TokenUsage         []TokenUsage    `json:"token_usage,omitempty"`
}
