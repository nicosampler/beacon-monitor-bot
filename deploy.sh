#!/bin/bash

set -e

echo "---- Starting Deployment Script ----"

echo "Pulling latest changes from Git..."
git pull

echo "Building Docker images with no cache..."
docker-compose build --no-cache

echo "Stopping and removing running containers..."
docker-compose down

echo "Pruning unused containers..."
docker container prune -f

echo "Pruning unused Docker images..."
docker image prune -f

echo "Pruning build cache..."
docker builder prune -f

echo "Starting containers..."
docker-compose up -d

echo "---- Deployment Completed Successfully ----"
