import os

previous_engine = 'early_christian_literature'

available_engines = ['early_christian_literature', 'reformed_commentaries', 'systematic_theology']

for engine in available_engines:
    print(f"\n\nWorking on {engine}...")

    # read main.py and replace "app/ccel_index" with "app/ccel_index_test"
    with open("precompute_tasks.py", "r") as f:
        main_py = f.read()
    main_py = main_py.replace(f"{previous_engine}", f"{engine}")

    # write main.py
    with open("precompute_tasks.py", "w") as f:
        f.write(main_py)

    # read Dockerfile and replace "main.py" with "main_test.py"
    with open("Dockerfile", "r") as f:
        dockerfile = f.read()
    dockerfile = dockerfile.replace(previous_engine, engine)

    # write Dockerfile
    with open("Dockerfile", "w") as f:
        f.write(dockerfile)

    engine_ = engine.replace("_", "-")
    
    if engine_ == 'reformed-commentaries':
        memory = '8Gi'
        cpus = 2
    else:
        memory = '2Gi'
        cpus = 1

    print(f"Memory: {memory}")
    print(f"CPUs: {cpus}\n\n")

    # build docker image
    os.system(f"docker build -t {engine_} .")

    # tag docker image
    os.system(f"docker tag {engine_} us-west1-docker.pkg.dev/calvinist-parrot/{engine_}/{engine_}")

    # create repository in Google Cloud
    os.system(f"gcloud artifacts repositories create {engine_} --repository-format=docker --location=us-west1 --description={engine_}")

    # push docker image
    os.system(f"docker push us-west1-docker.pkg.dev/calvinist-parrot/{engine_}/{engine_}")

    # deploy docker image to Cloud Run
    os.system(f"gcloud run deploy {engine_}-west2 --image us-west1-docker.pkg.dev/calvinist-parrot/{engine_}/{engine_} --region us-west2 --platform managed --allow-unauthenticated --port 80 --memory {memory} --cpu {cpus} --timeout 600 --max-instances 4 --min-instances 1")

    # delete docker image
    os.system(f"docker rmi {engine_}")

    previous_engine = engine