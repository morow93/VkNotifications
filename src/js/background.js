 /* Main logic */

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);

chrome.alarms.onAlarm.addListener(function(alarm) {
    try{
        main();
    }
    catch(e){
        console.log("Error: failed call of main function");
    }
});

function start(){    
   
    chrome.alarms.create("periodicalRequests_", { periodInMinutes: 1 }); //minimum
    
    chrome.storage.local.remove('vkaccess_token', function(){     
    
        chrome.storage.local.get({'vkaccess_token': {}}, function (items) {

            if (items.vkaccess_token.length === undefined) {

                var vkCLientId           = "4550524",
                    vkRequestedScopes    = "groups,wall,offline",
                    vkAuthenticationUrl  = 
                        "https://oauth.vk.com/authorize?client_id=" + 
                        vkCLientId + 
                        "&scope=" + 
                        vkRequestedScopes + 
                        "&redirect_uri=http%3A%2F%2Foauth.vk.com%2Fblank.html&display=page&v=5.24&response_type=token";
                
                chrome.tabs.query({currentWindow: true, active: true}, function(tabs){                
                    chrome.tabs.create({url: vkAuthenticationUrl, selected: true}, function (tab) {                
                        chrome.tabs.onUpdated.addListener(listenerHandler(tab.id, tabs[0].id));
                    });                    
                }); 
            }
        });       
    });
}

function listenerHandler(authenticationTabId, previousTabId) {

    return function tabUpdateListener(tabId, changeInfo) {
        var vkAccessTokenExpiredFlag,
            vkAccessToken;
        
        if (tabId === authenticationTabId && changeInfo.url !== undefined && changeInfo.status === "loading") {

            if (changeInfo.url.indexOf('oauth.vk.com/blank.html') > -1) {
                
                authenticationTabId = null;
                chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                
                //get vk token here
                vkAccessToken = getUrlParameterValue(changeInfo.url, 'access_token');
                if (vkAccessToken === undefined || vkAccessToken.length === undefined) {
                    console.log('vk auth response problem', 'access_token length = 0 or vkAccessToken == undefined');
                    return;
                }
                
                vkAccessTokenExpiredFlag = Number(getUrlParameterValue(changeInfo.url, 'expires_in'));
                if (vkAccessTokenExpiredFlag !== 0) {
                    console.log('vk auth response problem', 'vkAccessTokenExpiredFlag != 0' + vkAccessToken);
                    return;
                }                

                chrome.storage.local.set({'vkaccess_token': vkAccessToken}, function () {      
                    chrome.tabs.remove(tabId, function(){
                        chrome.tabs.update(previousTabId, {active: true});
                    });
                });
            }
        }
    };
}

function getUrlParameterValue(url, parameterName) {

    var urlParameters  = url.substr(url.indexOf("#") + 1),
        parameterValue = "",
        index,
        temp;

    urlParameters = urlParameters.split("&");

    for (index = 0; index < urlParameters.length; index += 1) {
        temp = urlParameters[index].split("=");

        if (temp[0] === parameterName) {
            return temp[1];
        }
    }

    return parameterValue;
}

/* Main logic */





/* Notifications create/destroy */

var pendingNotifications = {};

function createNotification(notifId, details, needUpdateBadge) {
    (notifId !== undefined) || (notifId = "");
    
    chrome.notifications.create(notifId, details, function(id) {
        console.log("Creating notification \"" + id + "\"");
        
        if (pendingNotifications[id] !== undefined) {
            clearTimeout(pendingNotifications[id].timer);
        }

        pendingNotifications[id] = {
            timer: setTimeout(function() {
                console.log("Respawning notification \"" + id + "\"");
                
                destroyNotification(id, function(wasCleared) {
                    if (wasCleared) {
                        createNotification(id, details);
                    }
                });
            }, 15000)
        };    
        if (needUpdateBadge){
            
            var counter = Object.size(pendingNotifications);
            if (counter === 0){
                chrome.browserAction.setBadgeText({ text: "" });
            }else{
                chrome.browserAction.setBadgeText({ text: String(counter) });
            }            
        }
    });
}

function destroyNotification(notifId, callback) {

    if (pendingNotifications[notifId] !== undefined) {
        clearTimeout(pendingNotifications[notifId].timer);
        delete(pendingNotifications[notifId]);
    }

    chrome.notifications.clear(notifId, function(wasCleared) {
        console.log("Destroying notification \"" + notifId + "\"");        
        
        if (!callback){            

            var counter = Object.size(pendingNotifications);
            if (counter === 0){
                chrome.browserAction.setBadgeText({ text: "" });
            }else{
                chrome.browserAction.setBadgeText({ text: String(counter) });
            }
        }
        callback && callback(wasCleared);
    });
}

/* Notifications create/destroy */





/* Notifications events */

chrome.notifications.onClicked.addListener(function(notifId) {
    if (pendingNotifications[notifId] !== undefined) {

        destroyNotification(notifId);

        chrome.tabs.query({}, function(tabs) {

            for(var i = 0; i < tabs.length; i++){
                
                if (tabs[i].url === notifId){
                    
                    if (!tabs[i].active){       
                        chrome.tabs.update(tabs[i].id, {active: true});
                    }
                    return;                    
                }                    
            }  
            chrome.tabs.create({ url: notifId });                
        }); 
    }
});

chrome.notifications.onClosed.addListener(function(notifId, byUser) {
    if (pendingNotifications[notifId] !== undefined) {
        destroyNotification(notifId);
    }
});

/* Notifications events */





/* Work functions */

function main(){
    
    chrome.storage.local.remove('lock_object', function(){
    
        chrome.storage.local.get({'storage_groups': {}}, function (items) { 
                
            if (!$.isEmptyObject(items.storage_groups)) {

                var storageGroups = items.storage_groups;

                var vkGroups = storageGroups.slice(0);

                function go(){            

                    if(vkGroups.length){

                        var currentGroup = vkGroups.shift();

                        chrome.storage.local.get({'vkaccess_token': {}}, function(items){

                            var request = 
                                "https://api.vk.com/method/wall.get?offset=0&owner_id=-" + 
                                currentGroup.id + 
                                "&count=11";

                            if (items.vkaccess_token.length !== undefined){
                                request += '&access_token=' + items.vkaccess_token;
                            }//no need to check anymore   
                                                        
                            chrome.storage.local.get({'lock_object': {}}, function (items){ 
                                                                
                                if (items.lock_object !== true){

                                    $.ajax({
                                        url: request,
                                        type: "GET",
                                        async: true,
                                        dataType: "JSON",
                                        timeout: 5000,
                                        success: function(data) { 
                                            if (!data.error){       

                                                if (!currentGroup.lastPostId ||
                                                    parseInt(data.response[1].id) > parseInt(currentGroup.lastPostId)){

                                                    var i = 1;
                                                    if (currentGroup.lastPostId){
                                                        for(; i < data.response.length; i++)
                                                        {
                                                            if (data.response[i].id === currentGroup.lastPostId) break;
                                                        }
                                                    }
                                                    --i;
                                                    currentGroup.lastPostId = data.response[1].id;

                                                    var title = "";                                                    
                                                    if (i <= 1){                                    
                                                        title = "Добавилась новость в \"" + currentGroup.name + "\"";   
                                                    }else if (i <= 10){
                                                        title = "Несколько новостей добавилось в \"" + currentGroup.name + "\". Последняя:";
                                                    }else{
                                                        title = "Более 10 новостей добавилось в \"" + currentGroup.name + "\". Последняя:";
                                                    }                                                    
                                                    var message = htmlToText(data.response[1].text);
                                                    
                                                    storageGroups.forEach(function(item, i) { 
                                                        if (item.domain === currentGroup.domain) {                                            
                                                            item.lastPostId = currentGroup.lastPostId;
                                                        }
                                                    });                                    

                                                    chrome.storage.local.set({'storage_groups': storageGroups}, function () { 
                                                        displayNotification(title, message, currentGroup.url);
                                                    });                                        
                                                }
                                            }
                                        },
                                        error: function(){
                                            console.log("Error: failed request to get post from _" + currentGroup.domain + "_");
                                        },
                                        complete: function(){
                                            go();
                                        }
                                    });                                

                                }else{
                                    main();//if list of groups was changed then call "main" again
                                }
                            });  
                        });                
                    }
                }
                go();//first call of "go"
            }
        });  
    });    
}

function displayNotification(title, message, notifId){
   
    var details = {
        type: "basic",
        iconUrl: "../images/icon128.png",
        title: title,
        message: message,
        priority: 2
    };
    
    destroyNotification(notifId);
    createNotification(notifId, details, {});
}

function htmlToText(plainHtml){
    
    plainHtml = $.trim(plainHtml);
    
    if (plainHtml.length > 0 && plainHtml !== "."){
        
        element = $("<div>" + plainHtml + "</div>");

        var replacedHtml = element.html().replace(/(<br>)|(<br \/>)|(<p>)|(<\/p>)/g, "\r\n");
        
        element.html(replacedHtml);        
        return element.text();
        
    }else{
        return "Нет текстового содержания";
    }    
}

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

/* Work functions */