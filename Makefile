.PHONY: build run clean docker-build docker-run docker-stop docker-clean

build:
	npm install 2>&1 | grep -v "EBADENGINE"
	npm run build

run:
	npm run dev

clean:
	rm -rf node_modules dist

docker-build:
	docker compose build

docker-run: docker-build
	@echo "App running at http://localhost:8099"
	docker compose up

docker-stop:
	docker compose down

docker-clean:
	docker compose down --rmi all --volumes --remove-orphans
	@echo "Removed containers, images, and volumes"
