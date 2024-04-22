import { GenezioDeploy} from "@genezio/types";
import { v4 as uuidv4 } from 'uuid';
import fetch from "node-fetch";
import { BackendService } from "./BackendService";

@GenezioDeploy()
export class UiPath {
	#accessToken: string|undefined;
	#machineName: string;
	#executing: any;
	#beating: boolean;
	#heartBeatInterval: NodeJS.Timeout|undefined;

	constructor() {
		console.log("Constructor called");
		this.#accessToken = undefined;
		this.#machineName = btoa('genezio-' + process.env.ENVIRONMENT);
		this.#beating = false;
		this.#heartBeatInterval = undefined;

		// handle process exit
		process.on('exit', this.#destructor.bind(this));
		process.on('SIGINT', this.#destructor.bind(this));
		process.on('SIGUSR1', this.#destructor.bind(this));
		process.on('SIGUSR1', this.#destructor.bind(this));
		process.on('uncaughtException', this.#destructor.bind(this));

		// start listening
		this.start();
	}

	async stop() {
		console.log("Cleaning up");
		if (this.#heartBeatInterval)
			clearInterval(this.#heartBeatInterval);
		this.#heartBeatInterval = undefined;
		this.#executing = {};
		this.#beating = false;
		await this.#stopService();
		this.#accessToken = undefined;
	}

	async #destructor() {
		await this.stop();
		process.exit(0);
	}

	async start() {
		if (!this.#accessToken) {
			console.log("Starting...");
			this.#executing = {};
			this.#beating = false;
			if (this.#heartBeatInterval)
				clearInterval(this.#heartBeatInterval);
			this.#heartBeatInterval = setInterval(this.#heartBeat.bind(this), 2000);
		}
	}

	async #connect() {
		if (this.#accessToken) return;

		const url = 'https://cloud.uipath.com/identity_/connect/token';

		const headers = {
			'Accept': 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded'
		};
		const body = `grant_type=client_credentials&scope=OrchestratorApiUserAccess&client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}`;

		console.log("Getting access token for " + process.env.CLIENT_ID);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: headers,
				body: body
			});

			if (!response.ok) {
				throw new Error(`HTTP error while getting the auth token! Status: ${response.status}`);
			}

			const responseJson:any = await response.json();

			console.log("Got access token");
			this.#accessToken = responseJson.access_token;
			await this.#startService();
		}catch (e: any) {
			console.error("Failed while getting the auth token:", e);
		}
  	}

  async #startService() {
	const baseUrl = process.env.ORCHESTRATOR_URL; // Assuming the .env file or environment has ORCHESTRATOR_URL defined
	const url = `${baseUrl}/api/robotsservice/StartService`;
	const headers = {
		'X-ROBOT-MACHINE-ENCODED': this.#machineName,
		'X-UIPATH-INSTALLATION-VERSION': '24.2.1',
		'X-UIPATH-INSTALLATION-ID': '0987654321',
		'Accept': 'application/json',
		'X-ROBOT-VERSION': '24.2.1',
		'X-ROBOT-AGENT': 'OS=Windows',
		'X-UIPATH-Localization': 'en',
		'Authorization': `Bearer ${this.#accessToken}`,
		'Content-Type': 'application/json; charset=utf-8'
	};
	const body = JSON.stringify({
		"ServiceUserName": null,
		"JobKey": null
	});
	
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: headers,
			body: body
		});

		if (!response.ok) {
			throw new Error(`HTTP error while starting the service! Status: ${response.status}`);
		}

		console.log("Service started");
	} catch(e: any) {
		console.error("Failed while starting the service:", e);
	}
  }

  async #stopService() {
	const baseUrl = process.env.ORCHESTRATOR_URL; // Assuming the .env file or environment has ORCHESTRATOR_URL defined
	const url = `${baseUrl}/api/robotsservice/StopService`;
	const headers = {
		'X-ROBOT-MACHINE-ENCODED': this.#machineName,
		'X-UIPATH-INSTALLATION-VERSION': '24.2.1',
		'X-UIPATH-INSTALLATION-ID': '0987654321',
		'Accept': 'application/json',
		'X-ROBOT-VERSION': '24.2.1',
		'X-ROBOT-AGENT': 'OS=Windows',
		'X-UIPATH-Localization': 'en',
		'Authorization': `Bearer ${this.#accessToken}`,
		'Content-Type': 'application/json; charset=utf-8'
	};
	const body = JSON.stringify({
		"CommandState": 0,
		"JobKey": null,
		"ServiceUserName": null
	});
	
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: headers,
			body: body
		});

		if (!response.ok) {
			throw new Error(`HTTP error while stopping the service! Status: ${response.status}`);
		}

		console.log("Service stopped");
	} catch(e: any) {
		console.error("Failed while stopping the service:", e);
	}
  }

  async #heartBeat() {
	if (this.#beating) return;
	this.#beating = true;
	try {
		await this.#connect();
		const baseUrl = process.env.ORCHESTRATOR_URL; // Assuming the .env file or environment has ORCHESTRATOR_URL defined
		const url = `${baseUrl}/api/robotsservice/HeartbeatV2`;
		const headers = {
			'X-ROBOT-MACHINE-ENCODED': this.#machineName,
			'X-UIPATH-INSTALLATION-VERSION': '24.2.1',
			'X-UIPATH-INSTALLATION-ID': '0987654321',
			'Accept': 'application/json',
			'X-ROBOT-VERSION': '24.2.1',
			'X-ROBOT-AGENT': 'OS=Windows',
			'X-UIPATH-Localization': 'en',
			'Authorization': `Bearer ${this.#accessToken}`,
			'Content-Type': 'application/json; charset=utf-8'
		};
		const body = JSON.stringify({
			"ServiceUserName": null,
			"CommandState": 0,
			"JobKey": null
		});

		const response = await fetch(url, {
			method: 'POST',
			headers: headers,
			body: body
		});

		if (!response.ok) {
			throw new Error(`HTTP error while the heart was beating! Status: ${response.status}`);
		}

		const responseJson: any = await response.json();

		for (let i:number=0;i<responseJson.commands.length;i++) {
			let command:any = responseJson.commands[i];
			if (command.data.type == 'StartProcess') {
				if (this.#executing[command.data.jobKey]) {
					continue;
				}
				this.#executing[command.data.jobKey] = true;
				console.log(JSON.stringify(command));
				await this.#startJob(command);
			} else if (command.data.type == 'StopProcess') {
				console.log(JSON.stringify(command));
				await this.#stopJob(command);
				this.#executing[command.data.jobKey] = false;
			} else {
				console.error("Unhandled type: " + command.data.type);
			}
		}
  	} catch(e: any) {
		console.error("Failed while the heart was beating:", e);
		this.#accessToken = undefined;
		clearInterval(this.#heartBeatInterval);
		this.#heartBeatInterval = undefined;
		setTimeout(this.start.bind(this), 60000);
	}
	this.#beating = false;
  }

  async #stopJob(jobDetails:any) {
	await this.#updateJob(jobDetails, {
		"JobState":6,
		"UserName":"genezio",
		"Info":"Job stopped",
		"OutputArguments":null,
		"RobotState":0
	});
  }

  async #startJob(jobDetails:any) {

	const inputArgs = JSON.parse(jobDetails.data.inputArguments);
	const functionName = jobDetails.data.entryPointPath.replace(/\.xaml$/, '');

	/*
	await this.#updateJob(jobDetails, {
		"JobState":1,
		"UserName": null,
		"Info":"Waiting for execution to start...",
		"OutputArguments": null,
		"RobotState": 1
	});

	await this.#updateJob(jobDetails, {
		"JobState":1,
		"UserName":"genezio",
		"Info":"Installing package...",
		"OutputArguments": null,
		"RobotState": 1
	});
	*/

	await this.#updateJob(jobDetails, {
		"JobState":1,
		"UserName":"genezio",
		"Info":"Job started processing",
		"OutputArguments": null,
		"RobotState": 1
	});

	await this.#logMessage(jobDetails, "Execution started");

	try {
		const bs = new BackendService();
		const outputArgs = await (bs as any)[functionName](inputArgs);
	
		await this.#updateJob(jobDetails, {
			"JobState":5,
			"UserName":"genezio",
			"Info":"Job completed",
			"OutputArguments": JSON.stringify(outputArgs),
			"RobotState":0
		});
	} catch(e:any) {
		//await this.#logMessage(jobDetails, e, "Error");
		await this.#updateJob(jobDetails, {
			"JobState":4,
			"UserName":"genezio",
			"Info": "Job failed",
			"OutputArguments": null,
			"RobotState":0
		});	
	}
	await this.#logMessage(jobDetails, "Execution ended");


	// 1: running
	// 2: stopping
	// 3: stopped
	// 4: faulted
	// 5: success
	// 6, 7: stopped
  }

  async #updateJob(jobDetails:any, bodyDetails:any):Promise<any> {
	const baseUrl = process.env.ORCHESTRATOR_URL;
	const url = `${baseUrl}/api/robotsservice/SubmitJobState`;
	const headers = {
		'X-ROBOT-MACHINE-ENCODED': this.#machineName,
		'X-UIPATH-INSTALLATION-VERSION': '24.2.1',
		'X-UIPATH-INSTALLATION-ID': '0987654321',
		'Accept': 'application/json',
		'X-ROBOT-VERSION': '24.2.1',
		'X-ROBOT-AGENT': 'OS=Windows',
		'X-UIPATH-Localization': 'en',
		'Authorization': `Bearer ${this.#accessToken}`,
		'Content-Type': 'application/json; charset=utf-8'
	};
	let body = {
		"RobotKey": jobDetails.robotKey,
		"JobKey": jobDetails.data.jobKey,
		"ProcessKey": jobDetails.data.processKey,
		"InputArguments": null,
		"RobotJobSource": null
	};

	body = { ...body, ...bodyDetails };

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify([body])
		});
		if (!response.ok) {
			throw new Error('HTTP status ' + response.status);
		}
	} catch(e: any) {
		console.error("Failed while updating the job:", e);
	}
  }

#getFormattedTimestamp() {
	const date = new Date();
  
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0'); // Add leading zero for single-digit months
	const day = String(date.getDate()).padStart(2, '0');
  
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');
  
	const milliseconds = String(date.getMilliseconds()).padStart(7, '0'); // Get milliseconds with padding for 7 digits
  
	const timezoneOffset = date.getTimezoneOffset() / 60; // Get timezone offset in hours (+/- for UTC)
	const timezoneSign = timezoneOffset >= 0 ? '+' : '-';
	const timezoneHours = String(Math.abs(timezoneOffset)).padStart(2, '0');
  
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${timezoneSign}${timezoneHours}:00`;
  }

  async #logMessage(jobDetails:any, message:string, level:string="Information"):Promise<any> {
	const baseUrl = process.env.ORCHESTRATOR_URL;
	const url = `${baseUrl}/api/Logs/SubmitLogs`;
	const headers = {
		'X-ROBOT-MACHINE-ENCODED': this.#machineName,
		'X-ROBOT-LICENSE': process.env.CLIENT_ID || 'not set as env variable',
		'X-UIPATH-INSTALLATION-VERSION': '24.2.1',
		'X-UIPATH-INSTALLATION-ID': '0987654321',
		'Accept': 'application/json',
		'X-ROBOT-VERSION': '24.2.1',
		'X-ROBOT-AGENT': 'OS=Windows',
		'X-UIPATH-Localization': 'en',
		'Authorization': `UiRobot ${jobDetails.authSettings["Auth.OAuth.RobotOAuthSecret"]}`,
		'Content-Type': 'application/json; charset=utf-8'
	};

	const body = "[\"" + JSON.stringify(
		{
			"message": message,
			"level": level,
			"logType": "Default",
			"timeStamp": this.#getFormattedTimestamp(),
			"fingerprint": uuidv4(),
			"windowsIdentity": "genezio\\serverless",
			"machineName": "genezio",
			"fileName": "Main",
			"initiatedBy": "Orchestrator",
			"processName": jobDetails.data.processName,
			"processVersion": jobDetails.data.packageVersion,
			"jobId": jobDetails.data.jobKey,
			"robotName": jobDetails.robotName,
			"machineId": jobDetails.machineId,
			"organizationUnitId": jobDetails.data.folderId
		}
	).replaceAll("\\", "\\\\").replaceAll('"', '\\"') + "\"]";

	const response = await fetch(url, {
		method: 'POST',
		headers: headers,
		body: body
	});

	if (!response.ok) {
		throw new Error('HTTP status ' + response.status);
	}
  }
}
