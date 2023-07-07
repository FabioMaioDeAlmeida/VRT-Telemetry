

const electron = require("electron");
const path = require("path");
const screen = electron.screen;
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const server = require("../src/Server/UDPServer");
const {getDatabase, addSession, deleteAllSessions, addDataType, setCurrentSession, getDataValuesBySessionAndDataType,
    deleteAllDataValue, getDataValuesBySession, addDataValue, getDataTypeID
} = require('../src/DataBase/Database');
const { getSessions } = require('../src/DataBase/Database');
const { ipcMain, dialog } = require('electron');
const DataTypeJson = require('../src/DataBase/Data/DataTypesTables.json');
const async = require("async");
const csv = require('csv-parser');
const fs = require("fs");
let isConnected = false;
let mainWindow;


function createWindow() {

    // Create the browser window.
    const { Width, Height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    // and load the index.html of the app.
    //console.log(__dirname);
    mainWindow.loadFile(path.join(__dirname, "../build/index.html"));

    //init database
    const database = getDatabase();
    addDataType(DataTypeJson);
    console.log("isConnected: "+isConnected);

    ipcMain.on('start-server', () => {
        server.start();
    });




    //######################################################################################
    //Live Data connexion at the lauching time


    //CODE GENERE; A MODIFIER !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    mainWindow.webContents.on('did-finish-load', () => {
        //server.start();

        let LiveData = server.getLiveData();


        const updateLiveData = () =>{
            LiveData = server.getLiveData();
            mainWindow.webContents.send('get-live-data', LiveData);
            isConnected = server.getConnectedStatus();
            mainWindow.webContents.send('ConnectedStatus', isConnected);
        }


        updateLiveData();

        setInterval(updateLiveData, 100);
        //setInterval(updateTensionBatteryHV, 100);



        //send the DB to the views
        mainWindow.webContents.send('database', database);
    });


    //######################################################################################



}
app.on("ready", createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();

});



//######################################################################################################################
//Communication between electron process and front process
ipcMain.handle('add-current-session', async (event, sessionId) => {
    await SendCurrentSessionToDB(sessionId);
});

const SendCurrentSessionToDB = async(sessionId)=>{
    await setCurrentSession(sessionId);
}






//generate code
ipcMain.handle('get-sessions', async () => {
    return getSessions();
});



//Send the add session
ipcMain.handle('add-session', async(event, args)=>{
    const{name, pilot, date}=args;
    try{
        const sessionId = await addSession(name, pilot, date);
        return{success: true, sessionId};
    }catch (err){
        return{success: false, error: err.message};
    }
});


ipcMain.handle('delete-sessions', async ()=>{
    return deleteAllSessions();
})

ipcMain.handle('deleteDataValues', async ()=> {
    return deleteAllDataValue();
})


ipcMain.handle("get-values-bySession", async(event, args)=>{
    const{sessionId}=args;
    try{
        const dataValues=await getDataValuesBySession(sessionId);
        return{success: true, dataValues};

    }catch (err){
        console.log(err);
    }
})


//hangle get all value data
ipcMain.handle("get-values-bySession-byType", async (event, args)=>{
    const{dataTypeName, sessionId}=args;
    try{
        const dataValues = await getDataValuesBySessionAndDataType(dataTypeName, sessionId);
        return{success: true, dataValues};

    }catch (err){
        console.log(err);
    }
})



//Get datatypeID

ipcMain.handle("get-datatype-id", async (event, args)=>{
    const{dataTypeName}=args;
    try{
        const dataTypeID = await getDataTypeID(dataTypeName);
        return{success: true, dataTypeID};

    }catch (err){
        console.log(err);
    }
})


//GC To modify
const moment = require('moment');

ipcMain.on('openFileSelection', (event, arg) => {
    const window = BrowserWindow.getFocusedWindow();

    dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    }).then((result) => {
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];

            // Lire les valeurs du fichier CSV
            fs.createReadStream(filePath)
                .pipe(csv({ separator: ';' })) // Spécifier le séparateur comme point-virgule
                .on('data', (data) => {
                    // Générer le sessionID et le timeRecord
                    const sessionID = null;
                    const timeRecordMilliseconds = data[Object.keys(data)[0]]; // Valeur de la première colonne en millisecondes
                    const timeRecord = moment(parseInt(timeRecordMilliseconds)).toISOString(); // Convertir en DateTime

                    // Itérer sur toutes les colonnes du CSV à partir de l'index 1
                    Object.entries(data).forEach(([columnName, value], index) => {
                        if (index > 0 && value !== null && value !== "") {
                            // Insérer chaque valeur individuellement dans la base de données avec le nom de colonne correspondant comme dataTypeName
                            addDataValue(sessionID, columnName, value, timeRecord)
                                .then((lastID) => {
                                    console.log(`DataValue added with the id: ${lastID}`);
                                })
                                .catch((err) => {
                                    console.log('Error when adding the dataValue: ' + err);
                                });
                        }
                    });
                })
                .on('end', () => {
                    console.log('CSV file processing complete.');
                    dialog.showMessageBox(window, {
                        type: 'info',
                        message: 'CSV file load successfully, please reload the data to see them !',
                        buttons: ['OK']
                    });
                });
        }
    });
});


