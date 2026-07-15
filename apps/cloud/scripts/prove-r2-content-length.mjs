import { randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { AwsClient } from "aws4fetch";

const requiredEnvironment = ["R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_SECRET_ACCESS_KEY"];

for (const name of requiredEnvironment) {
	if (!process.env[name]) {
		throw new Error(`${name} is required`);
	}
}

const accountId = process.env.R2_ACCOUNT_ID;
const bucketName = process.env.R2_BUCKET_NAME;
const client = new AwsClient({
	accessKeyId: process.env.R2_ACCESS_KEY_ID,
	region: "auto",
	secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
	service: "s3",
});

function objectUrl(key) {
	return `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucketName)}/${key}`;
}

async function signedRequest(method, key, contentLength) {
	const url = new URL(objectUrl(key));
	url.searchParams.set("X-Amz-Expires", "60");
	const headers = contentLength === undefined ? {} : { "Content-Length": String(contentLength) };
	const signed = await client.sign(new Request(url, { headers, method }), {
		aws: { allHeaders: true, signQuery: true },
	});
	return { headers, url: signed.url };
}

function send(method, url, headers, body) {
	return new Promise((resolve, reject) => {
		const request = httpsRequest(url, { headers, method }, (response) => {
			const chunks = [];
			response.on("data", (chunk) => chunks.push(chunk));
			response.on("end", () => {
				resolve({
					body: Buffer.concat(chunks).toString("utf8"),
					headers: response.headers,
					status: response.statusCode,
				});
			});
		});
		request.on("error", reject);
		request.setTimeout(10_000, () => request.destroy(new Error("request timed out")));
		if (body !== undefined) {
			request.write(body);
		}
		request.end();
	});
}

async function headSize(key) {
	const signed = await signedRequest("HEAD", key);
	const response = await send("HEAD", signed.url, signed.headers);
	if (response.status === 404) {
		return null;
	}
	if (response.status !== 200) {
		throw new Error(`HEAD failed with ${response.status}: ${response.body}`);
	}
	return Number(response.headers["content-length"]);
}

async function remove(key) {
	const signed = await signedRequest("DELETE", key);
	await send("DELETE", signed.url, signed.headers);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

const prefix = `packbat-content-length-proof/${randomUUID()}`;
const results = [];

try {
	const correctKey = `${prefix}/correct`;
	const correct = await signedRequest("PUT", correctKey, 5);
	const correctResponse = await send("PUT", correct.url, correct.headers, Buffer.from("hello"));
	const correctSize = await headSize(correctKey);
	assert(correctResponse.status === 200 && correctSize === 5, "the control PUT did not store exactly five bytes");
	results.push({ case: "matching header and body", objectSize: correctSize, status: correctResponse.status });

	const changedHeaderKey = `${prefix}/changed-header`;
	const changedHeader = await signedRequest("PUT", changedHeaderKey, 5);
	const changedHeaderResponse = await send(
		"PUT",
		changedHeader.url,
		{ ...changedHeader.headers, "Content-Length": "6" },
		Buffer.from("longer"),
	);
	const changedHeaderSize = await headSize(changedHeaderKey);
	assert(changedHeaderResponse.status === 403 && changedHeaderSize === null, "R2 accepted a changed signed length");
	results.push({ case: "changed signed header", objectSize: changedHeaderSize, status: changedHeaderResponse.status });

	const longBodyKey = `${prefix}/long-body`;
	const longBody = await signedRequest("PUT", longBodyKey, 5);
	const longBodyResponse = await send("PUT", longBody.url, longBody.headers, Buffer.from("longer"));
	const longBodySize = await headSize(longBodyKey);
	assert(longBodySize === null || longBodySize <= 5, "R2 stored more bytes than the signed Content-Length");
	results.push({ case: "body longer than signed length", objectSize: longBodySize, status: longBodyResponse.status });

	const shortBodyKey = `${prefix}/short-body`;
	const shortBody = await signedRequest("PUT", shortBodyKey, 5);
	let shortBodyStatus = "connection rejected";
	try {
		shortBodyStatus = (await send("PUT", shortBody.url, shortBody.headers, Buffer.from("tiny"))).status;
	} catch {
		// A framing error that closes the connection is an acceptable rejection.
	}
	const shortBodySize = await headSize(shortBodyKey);
	assert(shortBodySize === null, "R2 stored a body shorter than the signed Content-Length");
	results.push({ case: "body shorter than signed length", objectSize: shortBodySize, status: shortBodyStatus });

	console.table(results);
	console.log("result: signed Content-Length is a hard upper bound");
} finally {
	await Promise.all(
		["correct", "changed-header", "long-body", "short-body"].map((name) => remove(`${prefix}/${name}`)),
	);
}
