.PHONY: build run debug clean docker-build docker-run docker-stop docker-clean

build:
	npm install 2>&1 | grep -v "EBADENGINE"
	npm run build
	mkdir -p data

run:
	npm run dev

debug:
	npm run dev:debug

clean:
	rm -rf node_modules dist data

docker-build:
	docker compose build

docker-run: docker-build
	@echo "App running at http://localhost:8099"
	docker compose up

docker-stop:
	docker compose down

docker-clean:
	docker compose down --rmi all --volumes --remove-orphans
	rm -rf data
	@echo "Removed containers, images, volumes, and database"
