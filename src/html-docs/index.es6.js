import '../../node_modules/swagger-ui/dist/css/typography.css';
import '../../node_modules/swagger-ui/dist/css/reset.css';
import '../../node_modules/swagger-ui/dist/css/screen.css';

import 'script!../../node_modules/swagger-ui/dist/lib';
import 'script!../../node_modules/swagger-ui/dist/lib/jquery.slideto.min.js';
import 'script!../../node_modules/swagger-ui/dist/lib/jquery.wiggle.min.js';
import 'script!../../node_modules/swagger-ui/dist/lib/jquery.ba-bbq.min.js';
import 'script!../../node_modules/swagger-ui/dist/lib/handlebars-2.0.0.js';
import 'script!../../node_modules/swagger-ui/dist/lib/underscore-min.js';
import 'script!../../node_modules/swagger-ui/dist/lib/backbone-min.js';
import 'script!../../node_modules/swagger-ui/dist/swagger-ui.js';
import 'script!../../node_modules/swagger-ui/dist/lib/highlight.7.3.pack.js';
import 'script!../../node_modules/swagger-ui/dist/lib/marked.js';
import 'script!../../node_modules/swagger-ui/dist/lib/swagger-oauth.js';

import swaggerJSON from '../swagger.es6.js';


$(function () {
	var url = window.location.search.match(/url=([^&]+)/);
	if (url && url.length > 1) {
		url = decodeURIComponent(url[1]);
	} else {
		url = "http://petstore.swagger.io/v2/swagger.json";
	}

	// Pre load translate...
	if(window.SwaggerTranslator) {
		window.SwaggerTranslator.translate();
	}
	window.swaggerUi = new SwaggerUi({
		spec: swaggerJSON,
		dom_id: "swagger-ui-container",
		supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
		onComplete(swaggerApi, swaggerUi) {
			if(typeof initOAuth == "function") {
				initOAuth({
					clientId: "your-client-id",
					clientSecret: "your-client-secret",
					realm: "your-realms",
					appName: "your-app-name",
					scopeSeparator: ","
				});
			}

			if(window.SwaggerTranslator) {
				window.SwaggerTranslator.translate();
			}

			$('pre code').each(function(i, e) {
				hljs.highlightBlock(e)
			});

			addApiKeyAuthorization();
		},
		onFailure(data) {
			log("Unable to Load SwaggerUI");
		},
		docExpansion: "none",
		apisSorter: "alpha",
		showRequestHeaders: false
	});

	function addApiKeyAuthorization(){
		var key = encodeURIComponent($('#input_apiKey')[0].value);
		if(key && key.trim() != "") {
			var apiKeyAuth = new SwaggerClient.ApiKeyAuthorization("api_key", key, "query");
			window.swaggerUi.api.clientAuthorizations.add("api_key", apiKeyAuth);
			log("added key " + key);
		}
	}

	$('#input_apiKey').change(addApiKeyAuthorization);

	// if you have an apiKey you would like to pre-populate on the page for demonstration purposes...
	/*
	 var apiKey = "myApiKeyXXXX123456789";
	 $('#input_apiKey').val(apiKey);
	 */

	window.swaggerUi.load();

	function log() {
		if ('console' in window) {
			console.log.apply(console, arguments);
		}
	}
});
