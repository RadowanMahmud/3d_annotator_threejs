# AnnotationsEditor

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.5.

# Setup

The project is supported via node verisons greater than nodejs/20.9.0 and npm version 10.1.0.
Before setting up the project you should ensure the above environments.

Once you pulled the repository, if you see any exisitng ```package-lock.json``` file first remove it. Next run ```npm i```
You should be good to go.

# Running

The project is divided into two sections. An angular app for the front end and an express js server for the backend. 
To run the front end run ```npm start```. By default it will run on port 4200
To run the back end run ```node server.js```. By default it will run on port 3000

To save data locally in both ```folder_list.component.ts``` and ```UploadPly_2.component``` make sure ```apiBaseUrl``` is set to localhost 

# Data loading
To load any data locally you should store the annotation under ```/public/assets/val/<parent_folder>```
You need to have the following files under the parent directory
```
1. cam_params.json
2. input.png
3. depth_scene.png
4. 3dbbox_ground_no_icp.json
```