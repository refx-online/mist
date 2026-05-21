run:
	docker run \
		--network=host \
		--env-file=.env \
		-v meat-my-beat-i_data:/srv/root/.data \
		-it mist:latest

build:
	docker build -t mist:latest .
