### Ymts Crud Api

---

###### Author: [Vamsi Konakanchi (Me)](https://vamsi-k.com)

###### Start Date: 27-10-2024

## Objective

The objective of this project is to create a dynamic crud api which can perform all the crud operations on the tables in the database given the table name and the database name and the data in the request body, which saves time and effort in creating multiple endpoints for each table in the database and also makes the code more maintainable and scalable.

## Overview

This is a dynamic crud api in which there will be only 5 endpoints for all the tables in the database , the api will be able to perform all the crud operations on the tables in the database given the table name and the database name and the data in the request body.

This api is built using nodejs and expressjs and uses mongodb as the database.

## Installation

1. Clone the repository
2. Make sure you have nodejs `20.18.0` and mongodb-community `8.0` installed on your system
3. Run `npm install` to install all the dependencies
4. Create a `.env` file in the root directory and add the following environment variables
   ```javascript
   PORT=3000
   MONGO_URI=mongodb://localhost:27017/your-database-name
   ENCRYPTION_KEY=your-encryption-key # should be a 32 character string
   ```
5. Run `npm run dev` to start the dev server
6. Run `npm run build` to build the project
7. Run `npm start` to start the production server

## Endpoints

1. POST /api/v1/initialize

   - This endpoint is used to initialize the database and create the tables in the database

2. POST /api/v1/:database/:table

   - This endpoint is used to create multiple new record in the table

3. GET /api/v1/:database/:table

   - This endpoint is used to get all the records in the table

4. PUT /api/v1/:database/:table
   - This endpoint is used to update the records in the table
5. DELETE /api/v1/:database/:table
   - This endpoint is used to delete the records in the table

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](LICENSE) file for details

## Contribution

If you want to contribute to this project, feel free to fork the repository and create a pull request with your changes and I will review it and merge it if it is good.
