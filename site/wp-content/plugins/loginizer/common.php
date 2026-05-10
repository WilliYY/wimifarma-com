<?php

/**
 * NOTE:
 * Functions in this file must NOT depend on any WordPress functions.
 *
 * Some of these functions are executed before WordPress is fully initialized.
 * Adding WordPress-dependent logic here may result in fatal errors.
 *
 * When modifying or adding functions, always verify that
 * country-blocking, brute force or any pre-init functionality remain unaffected.
*/

if(!defined('ABSPATH') && !defined('LOGINIZER_FIREWALL')){
	die('HACKING ATTEMPT!');
}

// Get the client IP
function _lz_getip(){
	if(isset($_SERVER["REMOTE_ADDR"])){
		return $_SERVER["REMOTE_ADDR"];
	}elseif(isset($_SERVER["HTTP_X_FORWARDED_FOR"])){
		return $_SERVER["HTTP_X_FORWARDED_FOR"];
	}elseif(isset($_SERVER["HTTP_CLIENT_IP"])){
		return $_SERVER["HTTP_CLIENT_IP"];
	}
}

// Get the client IP
function lz_getip(){
	
	global $loginizer;
	
	// Just so that we have something
	$ip = _lz_getip();
	
	$loginizer['ip_method'] = (int) @$loginizer['ip_method'];
	
	if(isset($_SERVER["REMOTE_ADDR"])){
		$ip = $_SERVER["REMOTE_ADDR"];
	}
	
	if(isset($_SERVER["HTTP_X_FORWARDED_FOR"]) && @$loginizer['ip_method'] == 1){
		if(strpos($_SERVER["HTTP_X_FORWARDED_FOR"], ',')){
			$temp_ip = explode(',', $_SERVER["HTTP_X_FORWARDED_FOR"]);
			$ip = trim($temp_ip[0]);
		}else{
			$ip = $_SERVER["HTTP_X_FORWARDED_FOR"];
		}
	}
	
	if(isset($_SERVER["HTTP_CLIENT_IP"]) && @$loginizer['ip_method'] == 2){
		$ip = $_SERVER["HTTP_CLIENT_IP"];
	}
	
	if(@$loginizer['ip_method'] == 3 && isset($_SERVER[@$loginizer['custom_ip_method']])){
		$ip = $_SERVER[@$loginizer['custom_ip_method']];
	}
	
	// Hacking fix for X-Forwarded-For
	if(!lz_valid_ip($ip)){
		return '';
	}
	
	return $ip;
	
}

// Check if an IP is valid
function lz_valid_ip($ip){

	if(empty($ip)){
		return false;
	}
	
	// IPv6
	if(lz_valid_ipv6($ip)){
		return true;
	}
	
	// IPv4
	if(!ip2long($ip) || !lz_valid_ipv4($ip)){
		return false;
	}
	
	return true;
}

function lz_valid_ipv4($ip){
	if(!preg_match('/^(\d){1,3}\.(\d){1,3}\.(\d){1,3}\.(\d){1,3}$/is', $ip) || substr_count($ip, '.') != 3){			
		return false;
	}
	
	$r = explode('.', $ip);
	
	foreach($r as $v){
		$v = (int) $v;
		if($v > 255 || $v < 0){
			return false;
		}
	}
	
	return true;
	
}

function lz_valid_ipv6($ip){

	$pattern = '/^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(([0-9A-Fa-f]{1,4}:){0,5}:((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(::([0-9A-Fa-f]{1,4}:){0,5}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/';
	
	if(!preg_match($pattern, $ip)){
		return false;	
	}
	
	return true;
	
}

function loginizer_is_whitelisted(){
	
	global $loginizer;
	
	$whitelist = $loginizer['whitelist'];

	if(empty($whitelist)){
		return false;
	}

	$current_ip_inet = inet_ptoi($loginizer['current_ip']);

	foreach($whitelist as $k => $v){
		$start_inet = inet_ptoi($v['start']);
		$end_inet = inet_ptoi($v['end']);
		
		// Is the IP in the blacklist ?
		if($start_inet <= $current_ip_inet && $current_ip_inet <= $end_inet){
			$result = 1;
			break;
		}

		// Is it in a wider range ?
		if($start_inet >= 0 && $end_inet < 0){
			
			// Since the end of the RANGE (i.e. current IP range) is beyond the +ve value of inet_ptoi, 
			// if the current IP is <= than the start of the range, it is within the range
			// OR
			// if the current IP is <= than the end of the range, it is within the range
			if($start_inet <= $current_ip_inet
				|| $current_ip_inet <= $end_inet){
				$result = 1;
				break;
			}
			
		}
		
	}
		
	// You are whitelisted
	if(!empty($result)){
		return true;
	}
	
	return false;
	
}