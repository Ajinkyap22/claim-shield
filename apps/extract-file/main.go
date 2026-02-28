package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"

	"extract-file/handlers1"
)

func main() {

	// Load .env
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, using system env variables")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := mux.NewRouter()
	r.HandleFunc("/api/extract", handlers1.HandleExtract).Methods("POST")

	log.Println("Server running on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
