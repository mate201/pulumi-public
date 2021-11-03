import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";



// Please set you profile if needed
const k8sConfig: eks.KubeconfigOptions = {
    profileName: "default",
}

/* 
Create an EKS cluster with the default configuration. This step expects that one would have default VPC with default subnets 
including, public IPv4 address auto-assignment and route to the internet.
*/
const eksClusterStack = new eks.Cluster("test-cluster", {
    providerCredentialOpts: k8sConfig
});

const userData2 = pulumi.interpolate
`#!/bin/bash
systemctl stop kubelet
/etc/eks/bootstrap.sh ${eksClusterStack.eksCluster.name} --apiserver-endpoint ${eksClusterStack.eksCluster.endpoint} \
--b64-cluster-ca ${eksClusterStack.eksCluster.certificateAuthority.data} \
--kubelet-extra-args '--node-labels=eks.amazonaws.com/nodegroup="test-nodes"'
`

const eC2LaunchTemplate = new aws.ec2.LaunchTemplate(
    "test-node-launch-template",
    {
        name: "test-node-launch-template",
        // Ubuntu official EKS AMI
        imageId: "ami-0397f2bd5a5e28edb",
        instanceType: "t3a.medium",
        userData: userData2.apply(result => Buffer.from(result).toString("base64")),
        updateDefaultVersion: true
    }
)

const managedNodeGroup = eks.createManagedNodeGroup(
    "test-managed-node-group",
    {
        cluster: eksClusterStack,
        nodeGroupName: "test-managed-node-group",
        nodeRoleArn: eksClusterStack.instanceRoles[0].arn,
        scalingConfig: {
            desiredSize: 1,
            minSize: 0,
            maxSize: 3
        },
        // subnetIds: args.subnetIds,
        launchTemplate: {
            version: pulumi.interpolate `${eC2LaunchTemplate.latestVersion}`,
            id: eC2LaunchTemplate.id
        }
    }
);
