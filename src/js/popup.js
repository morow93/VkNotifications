$(function(){
    
    $.ajaxSetup({ cache: false });
        
    window.storageGroups = undefined;
    chrome.storage.local.get({'storage_groups': {}}, function (items) { 
    
        if (items.storage_groups !== undefined) {
            
            window.storageGroups = items.storage_groups;
            
            $("#groups-target").append("<ul></ul>");
            
            storageGroups.forEach(function(item) { 
                appendToContainer(item.url, item.name, $("ul"));     
            });
        }
    
    });
    
    //close popup
    $(".btn-close").click(function(){
        window.close();
    });
    $(window).unload(function(){
        chrome.storage.local.remove('lock_object', function(){});
    });
    
    //input select all on focus
    $("input[type='text']").on("click", function () {
       $(this).select();
    });
    
    //redirect to publics/group
    $(".lnk-group").click(function(e){
        
        var nextUrl = "http://vk.com/" + $(this).attr("href");
        
        chrome.tabs.query({}, function(tabs) {
            for(var i = 0; i < tabs.length; i++){
                
                if (tabs[i].url === nextUrl){
                    
                    if (!tabs[i].active){                    
                        chrome.tabs.update(tabs[i].id, {active: true});
                    }
                    return;                    
                }                    
            }            
            chrome.tabs.create({ url: nextUrl });
            return;        
        });  
    });
    
    //unsubscribe
    $(document).on("click", ".btn-unsubscribe", function(){
        
        var url = $(this).data("url").toString();
        
        if (window.storageGroups && window.storageGroups.length > 0){
            
            window.storageGroups.forEach(function(item, i){ 
                if (item.url === url) {             
                    //remove from local
                    window.storageGroups.splice(i, 1);
                    //set new to local
                    chrome.storage.local.set({'storage_groups': window.storageGroups}, function () {
                        //remove notification
                        chrome.notifications.clear(url, function(){}); //!!!
                        //change dom
                        $("li").filter("[data-url='" + url + "']").html("");
                        updateInfo("Вы успешно отписались");                    
                        
                        chrome.storage.local.get({'lock_object': {}}, function (items){ 
                            if (items.lock_object !== true){
                                chrome.storage.local.set({'lock_object': true}, function () {});
                            }
                        });                        
                    });
                    //return;
                }
            });            
        }    
    });
    
    //subscribe
    $("#popup-settings").submit(function(e){
        e.preventDefault();
    
        var vkGroupUrl = $("#vkGroupUrl").val();
        $(".btn").attr("disabled", "disabled");
        
        if (window.storageGroups){
            if (window.storageGroups.length >= 10){
                updateInfo("Нельзя подписаться больше чем на 10 пабликов/групп");
                return;
            }
        }
        
        if (isEmpty(vkGroupUrl)){
            
            chrome.tabs.query({currentWindow: true, active: true}, function(tabs){
                subscribe(tabs[0].url);
            });
            
        }else{
            subscribe(vkGroupUrl);
        }
        
        chrome.storage.local.get({'lock_object': {}}, function (items){ 
            if (items.lock_object !== true){
                chrome.storage.local.set({'lock_object': true}, function () {});
            }
        });   
    });
    
    //remove all notifications - right?
    $(".btn-remove").click(function(){
    
        chrome.notifications.getAll(function(ids){
            var counter = 0;
            
            for(id in ids){                
                chrome.notifications.clear(id, function(){});
                ++counter;
            }
            
            if (counter === 0){
                updateInfo("Входящих оповещений нет");
            }else{
                updateInfo("Оповещения были удалены");
            }
        });
        
    });
});

window.timeoutUpdateInfo = "";
function updateInfo(infoMessage){
    //set custom info
    $(".display-info").hide().html(infoMessage).fadeIn();
    //reset form
    $("#popup-settings")[0].reset();    
    //unblock
    $(".btn").removeAttr("disabled");
    //set standart info
    clearTimeout(window.timeoutUpdateInfo);    
    window.timeoutUpdateInfo = setTimeout(function(){        
        var standartMessage = "Если оставить поле пустым, то путь будет автоматически взят из адресной строки";
        $(".display-info").hide().html(standartMessage).fadeIn();
    }, 2000);
}

function isEmpty(str){
    return (!str || 0 === str.length);
}

var wasApiError = false;
function subscribe(url){

    var domain = url.split("/").last();
    
    function sendRequestToGetGroup(domain){
        
        chrome.storage.local.get({'vkaccess_token': {}}, function (items){ 

            var request = "https://api.vk.com/method/groups.getById?group_ids=" + domain;

            if (items.vkaccess_token.length !== undefined){
                request += '&access_token=' + items.vkaccess_token;
            }  

            $.ajax({
                url: request,
                type: "GET",
                async: true,
                dataType: "JSON",
                timeout: 5000,
                success: function(data) {                 

                    if (!data.error){     

                        var group = data.response[0];
                        var isMember = false, isClosed = false;

                        for(var prop in group) {
                            if (prop.indexOf("member") >= 0){
                                if (group[prop] === 1){
                                  isMember = true;
                                }
                            }else
                            if (prop.indexOf("closed") >= 0){
                                if (group[prop] === 1){
                                  isClosed = true;
                                }
                            }
                        }
                        if (!isMember && isClosed){
                            updateInfo("Вы не можете получать уведомления закрытого сообщества," + 
                                       " не являясь его членом"); 
                            return;
                        }
                        
                        if(window.storageGroups && window.storageGroups.length > 0){

                            var alreadySubscribed = false;
                            window.storageGroups.forEach(function(item, i) { 
                                if (item.domain === domain) {                                            
                                    alreadySubscribed = true;
                                }
                            }); 

                            if (!alreadySubscribed){                

                                var groupToStorage = {
                                    url: url,
                                    domain: domain,
                                    id: group.gid,
                                    name: group.name
                                };
                                window.storageGroups.push(groupToStorage);

                            }else{
                                updateInfo("Вы уже подписаны на эту группу"); 
                                wasApiError = false;
                                return;
                            }

                        }else{                        

                            var groupToStorage = {
                                url: url,
                                domain: domain,
                                id: group.gid,
                                name: group.name
                            };  

                            window.storageGroups = [];
                            window.storageGroups.push(groupToStorage);                
                        }
                        
                        chrome.storage.local.set({'storage_groups': window.storageGroups}, function () { 
                        
                            var containerToAppend = $("#groups-target").find("ul");
                            if (!containerToAppend.length){                    
                                $("#groups-target").append("<ul></ul>");
                            }
                            appendToContainer(groupToStorage.url, groupToStorage.name, $("ul"));

                            wasApiError = false;
                            updateInfo("Подписка выполнена"); 
                        });


                    }else{

                        if (wasApiError){                        
                            wasApiError = false;
                            updateInfo("Невалидный адрес сообщества"); 
                        }else{
                            wasApiError = true;

                            if (domain.indexOf("public") === 0){
                                domain = domain.replace("public",""); 
                            }else if (domain.indexOf("club") === 0){
                                domain = domain.replace("club",""); 
                            }

                            sendRequestToGetGroup(domain);
                        }
                    }
                },
                error: function(){
                    setTimeout(function(){
                        updateInfo("Адрес недоступен");
                    }, 400);
                }
           });
       });
    }
    sendRequestToGetGroup(domain);
}

//add group info
function appendToContainer(url, name, containerToAppend){
    
    if (!name) name = domain;
    
    var toAppend = 
        "<li data-url=\"" + 
        url + 
        "\"><div class=\"row\"><div class=\"col-xs-7 group-title text-overflow\">";

    toAppend += 
        "<a class=\"lnk-group\" href=\"" + 
        url + 
        "\" title=\"" + 
        name + 
        "\">" + 
        name + 
        "</a></div>";
    
    toAppend += 
        "<div class=\"col-xs-5\"><button type=\"button\" class=\"btn btn-xs btn-danger btn-unsubscribe\" data-url=\"" + 
        url + 
        "\">Отписаться</button></div></div></li>";
    
    containerToAppend.append(toAppend);  
}
        
Array.prototype.last = Array.prototype.last || function() {
    var l = this.length;
    return this[l-1];
}